import { Op } from "sequelize";
import { Content, Category, Channel, ContentChannel } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { contentProcessingQueue } from "../../queues/index.js";
import { logger } from "../../lib/logger.js";

export interface CreateContentDto {
  titulo: string;
  tipo: string;
  categoria_id?: number;
  /** @deprecated Use channel_ids instead. Kept for backward compat. */
  channel_id?: number;
  channel_ids?: number[];
  audio_url?: string;
  imagem_url?: string;
  duracao?: number;
  tags?: string[];
  ativo?: boolean;
}

export interface ContentFilters {
  page?: number;
  limit?: number;
  categoria_id?: number;
  channel_id?: number;
  tipo?: string;
  ativo?: boolean;
  search?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sync the content_channels junction for a single content row. */
async function syncChannels(contentId: number, channelIds: number[]): Promise<void> {
  await ContentChannel.destroy({ where: { content_id: contentId } });
  if (channelIds.length > 0) {
    await ContentChannel.bulkCreate(
      channelIds.map(cid => ({ content_id: contentId, channel_id: cid })),
      { ignoreDuplicates: true },
    );
  }
}

/** Add channel associations without removing existing ones. */
async function addChannels(contentId: number, channelIds: number[]): Promise<void> {
  if (channelIds.length === 0) return;
  await ContentChannel.bulkCreate(
    channelIds.map(cid => ({ content_id: contentId, channel_id: cid })),
    { ignoreDuplicates: true },
  );
}

/** Remove specific channel associations. */
async function removeChannels(contentId: number, channelIds: number[]): Promise<void> {
  if (channelIds.length === 0) return;
  await ContentChannel.destroy({ where: { content_id: contentId, channel_id: channelIds } });
}

/** Resolve effective channel_ids from dto. Falls back to [channel_id] for legacy callers. */
function resolveChannelIds(dto: { channel_id?: number; channel_ids?: number[] }): number[] | undefined {
  if (dto.channel_ids !== undefined) return dto.channel_ids;
  if (dto.channel_id !== undefined) return [dto.channel_id];
  return undefined;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ContentsService {
  async findAll(filters: ContentFilters) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filters.categoria_id) where["categoria_id"] = filters.categoria_id;
    if (filters.tipo) where["tipo"] = filters.tipo;
    if (filters.ativo !== undefined) where["ativo"] = filters.ativo;
    if (filters.search) where["titulo"] = { [Op.iLike]: `%${filters.search}%` };

    const channelsInclude = {
      model: Channel,
      as: "channels",
      through: { attributes: [] },
      attributes: ["id", "nome"],
      ...(filters.channel_id
        ? { where: { id: filters.channel_id }, required: true }
        : { required: false }),
    };

    const { count, rows } = await Content.findAndCountAll({
      where,
      include: [
        { model: Category, as: "categoria", attributes: ["id", "nome"] },
        channelsInclude,
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    const items = rows.map(row => {
      const plain = row.toJSON() as Record<string, unknown>;
      const channels = plain.channels as Array<{ id: number }> | undefined;
      plain.channel_ids = channels?.map(c => c.id) ?? [];
      return plain;
    });

    return { items, total: count, page, limit, totalPages: Math.ceil(count / limit) };
  }

  async findById(id: number) {
    const content = await Content.findByPk(id, {
      include: [
        { model: Category, as: "categoria" },
        { model: Channel, as: "channels", through: { attributes: [] }, attributes: ["id", "nome"] },
      ],
    });
    if (!content) throw new HttpError("Conteúdo não encontrado", 404);
    const plain = content.toJSON() as Record<string, unknown>;
    const channels = plain.channels as Array<{ id: number }> | undefined;
    plain.channel_ids = channels?.map(c => c.id) ?? [];
    return plain;
  }

  async create(dto: CreateContentDto) {
    const channelIds = resolveChannelIds(dto);
    const legacyChannelId = channelIds?.[0] ?? dto.channel_id ?? null;

    const { channel_ids: _ci, ...rest } = dto;
    const content = await Content.create({
      ...rest,
      channel_id: legacyChannelId,
    } as unknown as Parameters<typeof Content.create>[0]);

    if (channelIds && channelIds.length > 0) {
      await addChannels(content.id as number, channelIds);
    }

    try {
      await contentProcessingQueue.add("process", {
        contentId: content.id,
        audioPath: dto.audio_url,
      });
    } catch {
      logger.warn("contentProcessingQueue unavailable — content saved without async processing", {
        contentId: content.id,
      });
    }

    logger.info("Content created", { contentId: content.id, tipo: dto.tipo });
    return content;
  }

  async update(id: number, dto: Partial<CreateContentDto>) {
    const content = await Content.findByPk(id);
    if (!content) throw new HttpError("Conteúdo não encontrado", 404);

    const channelIds = resolveChannelIds(dto);
    const { channel_ids: _ci, ...rest } = dto;

    // Sync legacy channel_id to first entry in channelIds
    const legacyChannelId = channelIds !== undefined ? (channelIds[0] ?? null) : undefined;
    await content.update({ ...rest, ...(legacyChannelId !== undefined ? { channel_id: legacyChannelId } : {}) });

    if (channelIds !== undefined) {
      await syncChannels(id, channelIds);
    }

    return content;
  }

  async remove(id: number) {
    const content = await Content.findByPk(id);
    if (!content) throw new HttpError("Conteúdo não encontrado", 404);
    await content.destroy();
    return { id };
  }

  async bulkAssignChannels(
    contentIds: number[],
    channelIds: number[],
    mode: "add" | "replace" | "remove",
  ): Promise<{ updated: number }> {
    if (contentIds.length > 500 || channelIds.length > 500) {
      throw new HttpError("Máximo de 500 ids por chamada", 400);
    }
    if (contentIds.length === 0) return { updated: 0 };

    if (mode === "add") {
      await ContentChannel.bulkCreate(
        contentIds.flatMap(cid => channelIds.map(chid => ({ content_id: cid, channel_id: chid }))),
        { ignoreDuplicates: true },
      );
    } else if (mode === "replace") {
      await ContentChannel.destroy({ where: { content_id: contentIds } });
      if (channelIds.length > 0) {
        await ContentChannel.bulkCreate(
          contentIds.flatMap(cid => channelIds.map(chid => ({ content_id: cid, channel_id: chid }))),
          { ignoreDuplicates: true },
        );
      }
    } else if (mode === "remove") {
      await ContentChannel.destroy({
        where: { content_id: contentIds, channel_id: channelIds },
      });
    }

    return { updated: contentIds.length };
  }
}

export const contentsService = new ContentsService();

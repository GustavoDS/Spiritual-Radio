import { Op } from "sequelize";
import { Content, Category, Channel } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { contentProcessingQueue } from "../../queues/index.js";
import { logger } from "../../lib/logger.js";

export interface CreateContentDto {
  titulo: string;
  tipo: string;
  categoria_id?: number;
  channel_id?: number;
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

export class ContentsService {
  async findAll(filters: ContentFilters) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filters.categoria_id) where["categoria_id"] = filters.categoria_id;
    if (filters.channel_id) where["channel_id"] = filters.channel_id;
    if (filters.tipo) where["tipo"] = filters.tipo;
    if (filters.ativo !== undefined) where["ativo"] = filters.ativo;
    if (filters.search) where["titulo"] = { [Op.iLike]: `%${filters.search}%` };

    const { count, rows } = await Content.findAndCountAll({
      where,
      include: [
        { model: Category, as: "categoria", attributes: ["id", "nome"] },
        { model: Channel, as: "channel", attributes: ["id", "nome"] },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return { items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) };
  }

  async findById(id: number) {
    const content = await Content.findByPk(id, {
      include: [
        { model: Category, as: "categoria" },
        { model: Channel, as: "channel" },
      ],
    });
    if (!content) throw new HttpError("Conteúdo não encontrado", 404);
    return content;
  }

  async create(dto: CreateContentDto) {
    const content = await Content.create(dto as unknown as Parameters<typeof Content.create>[0]);

    await contentProcessingQueue.add("process", {
      contentId: content.id,
      audioPath: dto.audio_url,
    });

    logger.info("Content created", { contentId: content.id, tipo: dto.tipo });
    return content;
  }

  async update(id: number, dto: Partial<CreateContentDto>) {
    const content = await Content.findByPk(id);
    if (!content) throw new HttpError("Conteúdo não encontrado", 404);
    await content.update(dto);
    return content;
  }

  async remove(id: number) {
    const content = await Content.findByPk(id);
    if (!content) throw new HttpError("Conteúdo não encontrado", 404);
    await content.destroy();
    return { id };
  }
}

export const contentsService = new ContentsService();

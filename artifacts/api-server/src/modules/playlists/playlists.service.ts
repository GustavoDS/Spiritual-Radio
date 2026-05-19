import { Playlist, Channel } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";

export interface PlaylistFilters {
  channelId?: number;
  page?: number;
  limit?: number;
}

export class PlaylistsService {
  async findAll(filters: PlaylistFilters = {}) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (filters.channelId) where["channel_id"] = filters.channelId;

    const { count, rows } = await Playlist.findAndCountAll({
      where,
      include: [{ model: Channel, as: "channel", attributes: ["id", "nome"] }],
      order: [["data", "DESC"]],
      limit,
      offset,
    });
    return { items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) };
  }

  async findById(id: number) {
    const playlist = await Playlist.findByPk(id, {
      include: [{ model: Channel, as: "channel" }],
    });
    if (!playlist) throw new HttpError("Playlist não encontrada", 404);
    return playlist;
  }

  async create(channelId: number, data: string) {
    const channel = await Channel.findByPk(channelId);
    if (!channel) throw new HttpError("Canal não encontrado", 404);
    const [playlist] = await Playlist.findOrCreate({
      where: { channel_id: channelId, data },
      defaults: { channel_id: channelId, data },
    });
    return playlist;
  }

  async update(id: number, dto: { channel_id?: number; data?: string }) {
    const playlist = await Playlist.findByPk(id);
    if (!playlist) throw new HttpError("Playlist não encontrada", 404);
    if (dto.channel_id) {
      const channel = await Channel.findByPk(dto.channel_id);
      if (!channel) throw new HttpError("Canal não encontrado", 404);
    }
    await playlist.update(dto);
    return playlist;
  }

  async remove(id: number) {
    const p = await Playlist.findByPk(id);
    if (!p) throw new HttpError("Playlist não encontrada", 404);
    await p.destroy();
    return { id };
  }
}

export const playlistsService = new PlaylistsService();

import { Playlist, Channel, Content } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";

export class PlaylistsService {
  async findAll(channelId?: number) {
    const where: Record<string, unknown> = {};
    if (channelId) where["channel_id"] = channelId;
    return Playlist.findAll({
      where,
      include: [{ model: Channel, as: "channel", attributes: ["id", "nome"] }],
      order: [["data", "DESC"]],
    });
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

  async remove(id: number) {
    const p = await Playlist.findByPk(id);
    if (!p) throw new HttpError("Playlist não encontrada", 404);
    await p.destroy();
    return { id };
  }
}

export const playlistsService = new PlaylistsService();

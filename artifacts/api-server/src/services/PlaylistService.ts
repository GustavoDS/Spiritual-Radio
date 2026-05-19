import { Op, literal } from "sequelize";
import { Schedule, Content, Channel, Playlist, PlaylistItem } from "../models/index.js";
import { logger } from "../lib/logger.js";
import { HttpError } from "../middlewares/errorHandler.js";

function currentTimeStr(): string {
  const now = new Date();
  return [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join(":");
}

export class PlaylistService {
  async generatePlaylist(channelId: number, date: string): Promise<Playlist> {
    const channel = await Channel.findByPk(channelId);
    if (!channel) throw new HttpError(`Canal ${channelId} não encontrado`, 404);

    const [playlist, created] = await Playlist.findOrCreate({
      where: { channel_id: channelId, data: date },
      defaults: { channel_id: channelId, data: date },
    });

    const existingCount = await PlaylistItem.count({ where: { playlist_id: playlist.id } });
    if (created || existingCount === 0) {
      await this.buildPlaylist(playlist.id, channelId, date);
    }

    logger.info("PlaylistService.generatePlaylist", { channelId, date, playlistId: playlist.id, created });
    return playlist;
  }

  async buildPlaylist(playlistId: number, channelId: number, date: string): Promise<PlaylistItem[]> {
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59`);

    const schedules = await Schedule.findAll({
      where: {
        channel_id: channelId,
        horario_inicio: { [Op.between]: [dayStart, dayEnd] },
      },
      order: [["horario_inicio", "ASC"]],
    });

    await PlaylistItem.destroy({ where: { playlist_id: playlistId } });

    const items: PlaylistItem[] = [];
    let ordem = 0;

    for (const slot of schedules) {
      const content = await Content.findOne({
        where: { channel_id: channelId, tipo: slot.tipo, ativo: true },
        order: [literal("RANDOM()")],
      });

      const slotDate = new Date(slot.horario_inicio);
      const hora_execucao = [
        String(slotDate.getHours()).padStart(2, "0"),
        String(slotDate.getMinutes()).padStart(2, "0"),
        String(slotDate.getSeconds()).padStart(2, "0"),
      ].join(":");

      const item = await PlaylistItem.create({
        playlist_id: playlistId,
        content_id: content?.id ?? null,
        ordem: ordem++,
        hora_execucao,
      } as unknown as Parameters<typeof PlaylistItem.create>[0]);

      items.push(item);
    }

    logger.info("PlaylistService.buildPlaylist", { playlistId, channelId, date, itemCount: items.length });
    return items;
  }

  async getCurrentTrack(channelId: number): Promise<PlaylistItem | null> {
    const today = new Date().toISOString().split("T")[0]!;
    const playlist = await Playlist.findOne({ where: { channel_id: channelId, data: today } });
    if (!playlist) return null;

    return PlaylistItem.findOne({
      where: {
        playlist_id: playlist.id,
        hora_execucao: { [Op.lte]: currentTimeStr() },
      },
      include: [{ model: Content, as: "content" }],
      order: [["hora_execucao", "DESC"]],
    });
  }

  async getNextTrack(channelId: number): Promise<PlaylistItem | null> {
    const today = new Date().toISOString().split("T")[0]!;
    const playlist = await Playlist.findOne({ where: { channel_id: channelId, data: today } });
    if (!playlist) return null;

    return PlaylistItem.findOne({
      where: {
        playlist_id: playlist.id,
        hora_execucao: { [Op.gt]: currentTimeStr() },
      },
      include: [{ model: Content, as: "content" }],
      order: [["hora_execucao", "ASC"]],
    });
  }
}

export const playlistService = new PlaylistService();

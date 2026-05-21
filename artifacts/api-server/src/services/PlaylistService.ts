import { Op } from "sequelize";
import { Content, Channel, Playlist, PlaylistItem } from "../models/index.js";
import { scheduleService } from "./ScheduleService.js";
import { logger } from "../lib/logger.js";
import { HttpError } from "../middlewares/errorHandler.js";
import { realtimeService } from "./RealtimeService.js";

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

    logger.info("PlaylistService.generatePlaylist", {
      channelId,
      date,
      playlistId: playlist.id,
      created,
    });

    if (created) {
      realtimeService.broadcastPublic("playlist_updated", {
        channelId,
        date,
        playlistId: playlist.id,
        ts: new Date().toISOString(),
      });
    }

    return playlist;
  }

  async buildPlaylist(playlistId: number, channelId: number, date: string): Promise<PlaylistItem[]> {
    // Use ScheduleService to get the merged, priority-resolved schedule for this date
    const schedules = await scheduleService.findSchedulesForDate(date, channelId);

    await PlaylistItem.destroy({ where: { playlist_id: playlistId } });

    if (schedules.length === 0) {
      logger.warn("PlaylistService.buildPlaylist: no schedule slots found", { channelId, date });
      return [];
    }

    const tipos = [...new Set(schedules.map((s) => s.tipo).filter(Boolean))];

    const contentsByTipo = new Map<string, Content[]>();
    await Promise.all(
      tipos.map(async (tipo) => {
        const contents = await Content.findAll({
          where: { channel_id: channelId, tipo, ativo: true },
          attributes: ["id", "tipo", "titulo"],
          limit: 200,
        });
        contentsByTipo.set(tipo, contents);
        logger.debug("PlaylistService.buildPlaylist: batch loaded content", {
          tipo,
          count: contents.length,
        });
      }),
    );

    function pickRandom(tipo: string): Content | null {
      const pool = contentsByTipo.get(tipo) ?? [];
      if (pool.length === 0) return null;
      return pool[Math.floor(Math.random() * pool.length)] ?? null;
    }

    const items: PlaylistItem[] = [];
    let ordem = 0;

    for (const slot of schedules) {
      const content = pickRandom(slot.tipo);

      // hora_execucao = "HH:MM:SS" — horario_inicio is now a TIME string
      const hora_execucao = slot.horario_inicio.substring(0, 8); // ensure "HH:MM:SS"

      const item = await PlaylistItem.create({
        playlist_id: playlistId,
        content_id: content?.id ?? null,
        ordem: ordem++,
        hora_execucao,
      } as unknown as Parameters<typeof PlaylistItem.create>[0]);

      items.push(item);
    }

    logger.info("PlaylistService.buildPlaylist", {
      playlistId,
      channelId,
      date,
      scheduleSlots: schedules.length,
      tiposUnicos: tipos.length,
      itemCount: items.length,
    });
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

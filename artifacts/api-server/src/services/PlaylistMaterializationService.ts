import { Playlist, PlaylistItem, Channel } from "../models/index.js";
import { gradeProgramasService } from "../modules/grade-programas/grade-programas.service.js";
import { logger } from "../lib/logger.js";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface MaterializeResult {
  date: string;
  channel_id: number;
  playlist_id: number;
  items_created: number;
  programs_resolved: number;
}

type ResolvedItem = {
  ordem: number;
  content_id: number;
  starts_at: string | null;
};

/* ─── Service ────────────────────────────────────────────────────────────── */

export class PlaylistMaterializationService {
  /**
   * Build (or rebuild) the Playlist + PlaylistItems for one channel/date.
   * Extracts `hora_execucao` (HH:MM:SS) from each item's UTC `starts_at`.
   * The server is assumed to operate in UTC — consistent with AutoDJService
   * which uses `new Date().toISOString()` for "today" and `getHours()` for
   * the current time. If the deploy timezone is non-UTC, adjust here.
   */
  async materializeDay(channelId: number, date: string): Promise<MaterializeResult> {
    // 1. Upsert Playlist header for the day
    const [playlist] = await Playlist.findOrCreate({
      where: { channel_id: channelId, data: date },
      defaults: { channel_id: channelId, data: date } as Parameters<typeof Playlist.create>[0],
    });

    // 2. Full rebuild — delete all existing items for this playlist
    await PlaylistItem.destroy({ where: { playlist_id: playlist.id } });

    // 3. Resolve all grade_programas blocks for the day
    const dayResult = await gradeProgramasService.resolveDay(channelId, date);

    if (dayResult.total_blocks === 0 || dayResult.items.length === 0) {
      logger.info("PlaylistMaterializationService: no blocks for day", { channelId, date });
      return {
        date,
        channel_id: channelId,
        playlist_id: playlist.id,
        items_created: 0,
        programs_resolved: dayResult.total_blocks,
      };
    }

    // 4. Map resolved items → PlaylistItem rows
    //    starts_at is an ISO UTC string: "YYYY-MM-DDThh:mm:ssZ"
    //    hora_execucao must be "HH:MM:SS" (UTC, matched by AutoDJService)
    const rows = (dayResult.items as ResolvedItem[])
      .filter(item => Boolean(item.starts_at) && item.content_id)
      .map(item => {
        const timePart = item.starts_at!.includes("T")
          ? item.starts_at!.split("T")[1]!.slice(0, 8)
          : null;
        return {
          playlist_id: playlist.id,
          content_id: item.content_id,
          ordem: item.ordem,
          hora_execucao: timePart,
        };
      });

    if (rows.length > 0) {
      await PlaylistItem.bulkCreate(
        rows as Parameters<typeof PlaylistItem.bulkCreate>[0],
      );
    }

    logger.info("PlaylistMaterializationService: materialized", {
      channelId,
      date,
      playlist_id: playlist.id,
      items_created: rows.length,
      programs_resolved: dayResult.total_blocks,
    });

    return {
      date,
      channel_id: channelId,
      playlist_id: playlist.id,
      items_created: rows.length,
      programs_resolved: dayResult.total_blocks,
    };
  }

  /** Materialize playlists for ALL active channels for a given date (default: today). */
  async materializeAllChannels(date?: string): Promise<MaterializeResult[]> {
    const d = date ?? new Date().toISOString().split("T")[0]!;
    const channels = await Channel.findAll({ where: { ativo: true }, attributes: ["id"] });
    const results: MaterializeResult[] = [];

    for (const ch of channels) {
      try {
        results.push(await this.materializeDay(ch.id, d));
      } catch (err) {
        logger.error("PlaylistMaterializationService: failed for channel", {
          channelId: ch.id,
          date: d,
          err: (err as Error).message,
        });
      }
    }

    return results;
  }
}

export const playlistMaterializationService = new PlaylistMaterializationService();

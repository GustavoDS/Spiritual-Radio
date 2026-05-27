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

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Add `sec` seconds to an ISO-8601 UTC string and return a new ISO string. */
function addSecsToIso(isoStr: string, sec: number): string {
  return new Date(new Date(isoStr).getTime() + sec * 1000).toISOString();
}

/* ─── Service ────────────────────────────────────────────────────────────── */

/**
 * Materializes Playlist + PlaylistItem rows for a given channel/date from
 * the grade_programas schedule.  Called at startup and every 15 minutes so
 * AutoDJService always has a fresh Playlist to read from.
 *
 * Timezone note: `horario_inicio` values in grade_programas are treated as
 * server-local time (= UTC on Replit). `resolveDay` appends "Z" to them,
 * and AutoDJService uses `getHours()` (also server-local) for comparison.
 * Both sides are consistent as long as the server runs in UTC.  If you need
 * Brazil local-time support, convert horario_inicio to UTC before storing.
 *
 * Content looping: if the resolved content pool is smaller than the program's
 * duracao_min window, items are repeated (looped) to fill the full slot.
 * This ensures AutoDJService always finds a "current" item inside the block
 * and never falls back to `between_blocks` prematurely.
 */
export class PlaylistMaterializationService {
  async materializeDay(channelId: number, date: string): Promise<MaterializeResult> {
    // 1. Upsert Playlist header for the day
    const [playlist] = await Playlist.findOrCreate({
      where: { channel_id: channelId, data: date },
      defaults: { channel_id: channelId, data: date } as Parameters<typeof Playlist.create>[0],
    });

    // 2. Full rebuild — delete all existing items for this playlist
    await PlaylistItem.destroy({ where: { playlist_id: playlist.id } });

    // 3. Resolve all grade_programas blocks for the day (includes block metadata)
    const dayResult = await gradeProgramasService.resolveDay(channelId, date);

    if (dayResult.total_blocks === 0 || dayResult.blocks.length === 0) {
      logger.info("PlaylistMaterializationService: no blocks for day", { channelId, date });
      return {
        date,
        channel_id: channelId,
        playlist_id: playlist.id,
        items_created: 0,
        programs_resolved: 0,
      };
    }

    // 4. Build PlaylistItem rows per block, looping content to fill full duration
    type Row = { playlist_id: number; content_id: number; ordem: number; hora_execucao: string | null };
    const rows: Row[] = [];
    let ordem = 1;

    for (const block of dayResult.blocks) {
      if (block.items.length === 0) continue;

      // 4a. Add all resolved items
      for (const item of block.items) {
        const hora = item.starts_at?.split("T")[1]?.slice(0, 8) ?? null;
        rows.push({
          playlist_id: playlist.id,
          content_id: item.content_id,
          ordem: ordem++,
          hora_execucao: hora,
        });
      }

      // 4b. Loop content if the pool doesn't cover the full block duration.
      //     A 2-hour block with only one 5-min song would create 24 items
      //     at 5-min intervals so AutoDJService never sees `between_blocks`
      //     in the middle of a scheduled window.
      const blockDurationSec = block.duracao_min * 60;
      if (block.duracao_real_sec < blockDurationSec - 30) {
        let elapsed = block.duracao_real_sec;
        let loopCount = 0;
        const MAX_LOOP = 500; // safety cap (~41 h of 5-min content)

        while (elapsed < blockDurationSec - 30 && loopCount < MAX_LOOP) {
          const template = block.items[loopCount % block.items.length]!;
          const durSec = template.duration_sec > 0 ? template.duration_sec : 300;
          const horaIso = addSecsToIso(block.horario_inicio_iso, elapsed);
          const hora = horaIso.split("T")[1]?.slice(0, 8) ?? null;
          rows.push({
            playlist_id: playlist.id,
            content_id: template.content_id,
            ordem: ordem++,
            hora_execucao: hora,
          });
          elapsed += durSec;
          loopCount++;
        }

        logger.debug("PlaylistMaterializationService: looped content to fill block", {
          channelId,
          grade_id: block.grade_id,
          programa: block.programa_nome,
          original_items: block.items.length,
          looped_items: loopCount,
          duracao_min: block.duracao_min,
        });
      }
    }

    if (rows.length > 0) {
      await PlaylistItem.bulkCreate(rows as Parameters<typeof PlaylistItem.bulkCreate>[0]);
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

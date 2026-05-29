import { Op } from "sequelize";
import { Playlist, PlaylistItem, Channel, Content } from "../models/index.js";
import { gradeProgramasService } from "../modules/grade-programas/grade-programas.service.js";
import { vinhetasService } from "../modules/vinhetas/vinhetas.service.js";
import { backgroundTrackMixService } from "./BackgroundTrackMixService.js";
import { autoDjService } from "./AutoDJService.js";
import { logger } from "../lib/logger.js";
import type { ResolvedItem } from "./ResolveService.js";

/* ─── Constants ──────────────────────────────────────────────────────────── */

/** Content types that require TTS + background music mixing. */
const SPOKEN_TYPES = new Set(["oracao", "reflexao", "mensagem", "versiculo"]);
/** Safety cap on playlist looping to prevent infinite loops. */
const MAX_LOOP = 500;

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Deterministic shuffle using mulberry32 PRNG (same algorithm as ResolveService). */
function hashSeed(str: string): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x517cc1b727220a95 | 0);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  return function () {
    seed += 0x6d2b79f5;
    let z = seed;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

function shuffleLoop<T>(arr: T[], seed: string): T[] {
  const rng = mulberry32(hashSeed(seed));
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface MaterializeResult {
  date: string;
  channel_id: number;
  playlist_id: number;
  items_created: number;
  programs_resolved: number;
}

type Row = {
  playlist_id: number;
  content_id: number | null;
  ordem: number;
  hora_execucao: string | null;
  vinheta_url?: string | null;
  vinheta_duracao?: number | null;
  vinheta_titulo?: string | null;
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function addSecsToIso(isoStr: string, sec: number): string {
  return new Date(new Date(isoStr).getTime() + sec * 1000).toISOString();
}

function isoToHora(isoStr: string): string {
  return isoStr.split("T")[1]?.slice(0, 8) ?? "00:00:00";
}

/** Maps "HH:MM:SS" → BlocoVinheta name (mirrors VinhetaInjectionService). */
function blocoFromHoraStr(horaStr: string): string {
  const h = parseInt(horaStr.split(":")[0] ?? "0", 10);
  if (h < 5)  return "madrugada";
  if (h < 7)  return "amanhecer";
  if (h < 12) return "manha";
  if (h < 14) return "almoco";
  if (h < 18) return "tarde";
  if (h < 21) return "prime";
  if (h < 23) return "noite";
  return "sleep";
}

/** Maps content.tipo → the "antes_de_X" vinheta tipo. */
function beforeTipoVinheta(contentTipo: string): string | null {
  if (contentTipo === "oracao")                                                  return "antes_de_oracao";
  if (["mensagem", "pregacao", "devocional", "reflexao"].includes(contentTipo)) return "antes_de_mensagem";
  if (contentTipo === "versiculo")                                               return "antes_de_versiculo";
  return null;
}

/* ─── Service ────────────────────────────────────────────────────────────── */

/**
 * Materializes Playlist + PlaylistItem rows for a given channel/date from
 * the grade_programas schedule.  Called at startup and every 15 minutes.
 *
 * ## Vinheta injection
 * For each program block the materializer injects vinheta rows:
 *  - **abertura** at block start
 *  - **antes_de_X** before spoken content with usa_vinheta_automatica = true
 *  - **transicao** every 3rd consecutive musica
 *  - **encerramento** at block end (if time remains)
 * Vinheta items use PlaylistItem.vinheta_url / vinheta_duracao / vinheta_titulo;
 * their content_id is null.
 *
 * ## Background audio mixing
 * After materializing, fires async mix generation (via BackgroundTrackMixService)
 * for all spoken-type content items that still lack mixed_audio_url.  This is
 * fire-and-forget so it never blocks materialization.
 *
 * ## Timezone note
 * horario_inicio values are treated as server-local (= UTC on Replit).
 * resolveDay() appends "Z" to make them ISO UTC; AutoDJService uses getHours()
 * (also local). Consistent as long as the server runs in UTC.
 */
export class PlaylistMaterializationService {
  async materializeDay(channelId: number, date: string): Promise<MaterializeResult> {
    // 1. Upsert Playlist header for the day
    const [playlist] = await Playlist.findOrCreate({
      where: { channel_id: channelId, data: date },
      defaults: { channel_id: channelId, data: date } as Parameters<typeof Playlist.create>[0],
    });

    // 2. Full rebuild — delete all existing items for this playlist.
    // Signal AutoDJService BEFORE destroying rows so the watcher doesn't
    // misinterpret the empty-table window as a genuine "no_schedule" gap.
    autoDjService.setRematerializing(channelId, true);
    try {
      await PlaylistItem.destroy({ where: { playlist_id: playlist.id } });
    } catch (err) {
      autoDjService.setRematerializing(channelId, false);
      throw err;
    }

    // 3. Resolve all grade_programas blocks (includes block metadata)
    const dayResult = await gradeProgramasService.resolveDay(channelId, date);

    if (dayResult.total_blocks === 0 || dayResult.blocks.length === 0) {
      logger.info("PlaylistMaterializationService: no blocks for day", { channelId, date });
      return { date, channel_id: channelId, playlist_id: playlist.id, items_created: 0, programs_resolved: 0 };
    }

    // 4. Batch-load usa_vinheta_automatica for all content IDs in one query
    const allContentIds = [...new Set(dayResult.blocks.flatMap((b) => b.items.map((i) => i.content_id)))];
    const contentMeta = allContentIds.length > 0
      ? await Content.findAll({
          where: { id: { [Op.in]: allContentIds } },
          attributes: ["id", "usa_vinheta_automatica"],
        })
      : [];
    const usaVinhetaMap = new Map(contentMeta.map((c) => [c.id, c.usa_vinheta_automatica]));

    // 5. Build PlaylistItem rows per block with vinheta injection
    const rows: Row[] = [];
    let ordem = 1;

    for (const block of dayResult.blocks) {
      if (block.items.length === 0) continue;

      const bloco = blocoFromHoraStr(block.horario_inicio);
      let elapsed = 0;
      let musicaCount = 0;

      /** Pick a vinheta and push a row; silently skips if none available. */
      const pushVinheta = async (tipoV: string): Promise<void> => {
        const v = await vinhetasService.pickVinheta(channelId, bloco, tipoV).catch(() => null);
        if (!v?.audio_url) return;
        const dur = (v as { duracao_sec?: number }).duracao_sec ?? 10;
        rows.push({
          playlist_id: playlist.id,
          content_id: null,
          ordem: ordem++,
          hora_execucao: isoToHora(addSecsToIso(block.horario_inicio_iso, elapsed)),
          vinheta_url: v.audio_url,
          vinheta_duracao: dur,
          vinheta_titulo: (v as { nome?: string }).nome ?? "Vinheta",
        });
        elapsed += dur;
      };

      // 5a. Block abertura
      await pushVinheta("abertura");

      // 5b. First pass — content items with "antes_de_X" vinheta injection
      for (const item of block.items) {
        // Inject antes_de_X before spoken content that has auto-vinheta enabled
        if (item.tipo !== "musica" && (usaVinhetaMap.get(item.content_id) ?? true)) {
          const tipoV = beforeTipoVinheta(item.tipo);
          if (tipoV) await pushVinheta(tipoV);
        }

        // Content item
        rows.push({
          playlist_id: playlist.id,
          content_id: item.content_id,
          ordem: ordem++,
          hora_execucao: isoToHora(addSecsToIso(block.horario_inicio_iso, elapsed)),
        });
        elapsed += item.duration_sec > 0 ? item.duration_sec : 300;

        // Transicao every 3 consecutive musicas
        if (item.tipo === "musica") {
          musicaCount++;
          if (musicaCount % 3 === 0) await pushVinheta("transicao");
        } else {
          musicaCount = 0;
        }
      }

      // 5c. Loop remaining time to fill block duration.
      // Each full cycle through block.items is re-shuffled with a unique seed so
      // the same tracks don't appear in the same order on every repetition.
      // This prevents the "same song every 3 tracks" pattern when pools are small.
      const blockDurationSec = block.duracao_min * 60;
      let loopCount = 0;
      let loopPass = 0;
      // loopTape holds the current shuffled copy of block.items
      let loopTape = block.items.length > 0 ? [...block.items] : [];
      while (elapsed < blockDurationSec - 30 && loopCount < MAX_LOOP && loopTape.length > 0) {
        const idxInPass = loopCount % loopTape.length;
        // Start of a new pass → reshuffle with a pass-specific seed for variety
        if (idxInPass === 0 && loopCount > 0) {
          loopPass++;
          loopTape = shuffleLoop(block.items, `${block.grade_id}-pass${loopPass}`);
        }
        const template = loopTape[idxInPass]!;
        const durSec = template.duration_sec > 0 ? template.duration_sec : 300;
        rows.push({
          playlist_id: playlist.id,
          content_id: template.content_id,
          ordem: ordem++,
          hora_execucao: isoToHora(addSecsToIso(block.horario_inicio_iso, elapsed)),
        });
        elapsed += durSec;
        loopCount++;
      }

      // 5d. Block encerramento (only if there's still time in the block)
      if (elapsed < blockDurationSec) await pushVinheta("encerramento");

      if (loopCount > 0) {
        logger.debug("PlaylistMaterializationService: looped content to fill block", {
          channelId, grade_id: block.grade_id, programa: block.programa_nome,
          original_items: block.items.length, looped_items: loopCount,
          duracao_min: block.duracao_min,
        });
      }
    }

    // 6. Persist all rows in one batch, then clear the rematerialising guard
    try {
      if (rows.length > 0) {
        await PlaylistItem.bulkCreate(rows as Parameters<typeof PlaylistItem.bulkCreate>[0]);
      }
    } finally {
      // Always release the guard so the watcher resumes normal offline detection
      autoDjService.setRematerializing(channelId, false);
    }

    logger.info("PlaylistMaterializationService: materialized", {
      channelId, date, playlist_id: playlist.id,
      items_created: rows.length,
      programs_resolved: dayResult.total_blocks,
    });

    // 7. Fire async mix generation for spoken-type content (non-blocking)
    void this._triggerAsyncMixes(dayResult.blocks.flatMap((b) => b.items));

    return { date, channel_id: channelId, playlist_id: playlist.id, items_created: rows.length, programs_resolved: dayResult.total_blocks };
  }

  /**
   * Fire-and-forget: generate mixed_audio_url for each spoken-type content
   * that still lacks it.  Refetches Content from the DB so we always use the
   * raw audio_url (never the already-mixed URL) and skip items that already
   * have a mix.  Runs sequentially to avoid saturating ffmpeg/upload.
   * Never throws — errors are logged as warnings.
   */
  private async _triggerAsyncMixes(items: ResolvedItem[]): Promise<void> {
    // Collect unique spoken content IDs
    const seen = new Set<number>();
    const spokenIds: number[] = [];
    for (const i of items) {
      if (SPOKEN_TYPES.has(i.tipo) && i.content_id != null && !seen.has(i.content_id)) {
        seen.add(i.content_id);
        spokenIds.push(i.content_id);
      }
    }
    if (spokenIds.length === 0) return;

    // Refetch from DB: only items that have raw audio_url but no mix yet
    const pending = await Content.findAll({
      where: ({
        id: { [Op.in]: spokenIds },
        audio_url: { [Op.not]: null },
        mixed_audio_url: null,
      }) as Record<string, unknown>,
      attributes: ["id", "tipo", "audio_url", "mixed_audio_url", "background_track_id"],
    });

    if (pending.length === 0) return;

    logger.info("PlaylistMaterializationService: queuing async mixes", { count: pending.length });

    for (const content of pending) {
      await backgroundTrackMixService
        .resolveAudioUrl({
          id: content.id,
          tipo: content.tipo,
          audio_url: content.audio_url,
          mixed_audio_url: content.mixed_audio_url ?? null,
          background_track_id: (content as unknown as { background_track_id?: string | null }).background_track_id ?? null,
        })
        .catch((err) =>
          logger.warn("PlaylistMaterializationService: async mix failed", {
            contentId: content.id, err: (err as Error).message,
          }),
        );
    }

    logger.info("PlaylistMaterializationService: async mixes done", { processed: pending.length });
  }

  /**
   * Materialize playlists for ALL active channels for the given date(s).
   *
   * When called **without** a specific `date`, always materializes today +
   * tomorrow so there is never a "playlist not found" gap at midnight.
   *
   * When an explicit `date` is supplied, only that date is materialized.
   */
  async materializeAllChannels(date?: string): Promise<MaterializeResult[]> {
    const dates: string[] = date
      ? [date]
      : [
          new Date().toISOString().split("T")[0]!,
          new Date(Date.now() + 86_400_000).toISOString().split("T")[0]!,
        ];

    const channels = await Channel.findAll({ where: { ativo: true }, attributes: ["id"] });
    const results: MaterializeResult[] = [];

    for (const d of dates) {
      for (const ch of channels) {
        try {
          results.push(await this.materializeDay(ch.id, d));
        } catch (err) {
          logger.error("PlaylistMaterializationService: failed for channel", {
            channelId: ch.id, date: d, err: (err as Error).message,
          });
        }
      }
    }

    return results;
  }
}

export const playlistMaterializationService = new PlaylistMaterializationService();

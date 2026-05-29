import { Op } from "sequelize";
import { Content, Channel, PlayHistory, Programa } from "../models/index.js";
import type { ReceitaItem, RegrasPrograma } from "../models/Programa.js";
import { HttpError } from "../middlewares/errorHandler.js";
import { logger } from "../lib/logger.js";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface ResolvedItemContent {
  id: number;
  titulo: string;
  tipo: string;
  audio_url: string | null;
  imagem_url: string | null;
  duracao: number;
}

export interface ResolvedItem {
  ordem: number;
  content_id: number;
  titulo: string;
  tipo: string;
  duration_sec: number;
  starts_at: string | null;
  /** Effective audio URL (prefers mixed_audio_url, falls back to audio_url). */
  audio_url: string | null;
  /** Full content object for frontend rendering. */
  content: ResolvedItemContent;
}

export interface ResolveResult {
  programa: { id: number; nome: string; duracao_min: number };
  starts_at: string | null;
  duracao_real_sec: number;
  /** Alias of duracao_real_sec — added for frontend compatibility. */
  total_duration_sec: number;
  items: ResolvedItem[];
  ajustes: { vazio_sec: number; trocas: number };
  /** Number of items per content tipo in the resolved timeline. */
  counts: Record<string, number>;
  /**
   * Warnings for empty or thin pools, useful for the frontend to surface
   * under-stocked channels. Also set when a tipo in the receita is invalid.
   */
  pool_warnings: string[];
}

/**
 * Minimal content shape required by the pure timeline-building function.
 * Exported so tests can construct lightweight fakes without DB models.
 */
export interface ContentLike {
  id: number;
  tipo: string;
  duracao: number | null;
  titulo: string;
  audio_url: string | null;
  mixed_audio_url?: string | null;
  imagem_url?: string | null;
}

export interface FilledTimelineResult {
  items: ContentLike[];
  counts: Record<string, number>;
  pool_warnings: string[];
}

/* ─── Valid content types ────────────────────────────────────────────────── */

/**
 * Types that live in the `contents` table and can be resolved by ResolveService.
 * Vinhetas are handled separately by PlaylistMaterializationService via the
 * `vinhetas` table (bloco + tipo_vinheta + channel_id) and must NOT appear here.
 */
export const TIPOS_VALIDOS_CONTENTS = ["musica", "oracao", "mensagem", "reflexao", "versiculo"];

/* ─── Deterministic PRNG (mulberry32) ───────────────────────────────────── */

export function hashSeed(str: string): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x517cc1b727220a95 | 0);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  return function () {
    seed += 0x6d2b79f5;
    let z = seed;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

export function shuffleWithSeed<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/* ─── Time helpers ───────────────────────────────────────────────────────── */

function addSecondsToIso(isoStr: string, sec: number): string {
  return new Date(new Date(isoStr).getTime() + sec * 1000).toISOString();
}

/* ─── Pure timeline builder (exported for unit tests) ───────────────────── */

/** Safety cap: max items picked per tipo tape to prevent infinite loops. */
const MAX_FILL = 2000;

/**
 * Builds a content timeline for a program block from pre-shuffled pools.
 *
 * For each tipo in the receita:
 *   - Fills a tape to its proportional target (totalSec × pct/100).
 *   - Loops through the pool with per-pass reshuffles (deterministic via seedStr).
 *   - Avoids immediate consecutive repetition of the same content_id when pool > 1.
 *   - Warns if the pool is empty or too thin to fill 90% of the target.
 *
 * Interleaves the per-tipo tapes proportionally (round-robin) while respecting
 * max_musicas_seguidas, then flushes any items stranded by the consecutive cap.
 *
 * Returns { items, counts, pool_warnings } — fully pure, no DB calls.
 */
export function buildFilledTimeline(
  poolsByTipo: Map<string, ContentLike[]>,
  receita: ReceitaItem[],
  totalSec: number,
  maxMusSeguid: number,
  seedStr: string,
): FilledTimelineResult {
  const pool_warnings: string[] = [];
  const pickedByTipo = new Map<string, ContentLike[]>();

  // A. Build per-tipo tapes that fill proportional target duration
  for (const item of receita) {
    if (!TIPOS_VALIDOS_CONTENTS.includes(item.tipo)) {
      pool_warnings.push(`tipo=${item.tipo}: não é um tipo válido de contents — ignorado`);
      continue;
    }

    const targetSec = Math.round(totalSec * item.pct / 100);
    const pool = poolsByTipo.get(item.tipo) ?? [];

    if (pool.length === 0) {
      pool_warnings.push(`tipo=${item.tipo}: pool vazio — slot de ${targetSec}s ignorado`);
      pickedByTipo.set(item.tipo, []);
      continue;
    }

    const tape: ContentLike[] = [];
    let accumulated = 0;
    let loopPass = 0;
    let passItems = [...pool]; // already shuffled before calling this function
    let lastId = -1;
    let safetyCount = 0;

    outer:
    while (accumulated < targetSec - 30 && safetyCount < MAX_FILL) {
      let addedInPass = false;

      for (const track of passItems) {
        const dur = track.duracao ?? 0;
        if (dur <= 0) continue;

        // Avoid immediate consecutive repeat; always allow when pool has 1 item
        if (track.id === lastId && pool.length > 1) continue;

        tape.push(track);
        accumulated += dur;
        lastId = track.id;
        safetyCount++;
        addedInPass = true;

        if (accumulated >= targetSec - 30 || safetyCount >= MAX_FILL) break outer;
      }

      // All items in pass were skipped (edge case: all remaining are lastId)
      if (!addedInPass) break;

      // Reshuffle for next pass — deterministic, seeded per tipo + pass
      loopPass++;
      passItems = shuffleWithSeed(
        [...pool],
        mulberry32(hashSeed(`${seedStr}-${item.tipo}-pass${loopPass}`)),
      );
    }

    if (tape.length === 0 && pool.length > 0) {
      // Defensive: force at least one item
      tape.push(pool[0]!);
      accumulated = pool[0]!.duracao ?? 0;
    }

    if (pool.length === 1 && tape.length > 1) {
      pool_warnings.push(
        `tipo=${item.tipo}: pool com 1 item — repetição forçada para cobrir ${targetSec}s`,
      );
    } else if (accumulated < targetSec * 0.9) {
      pool_warnings.push(
        `tipo=${item.tipo}: pool insuficiente` +
        ` (${pool.length} item(s), ${accumulated}s de ${targetSec}s alvo)`,
      );
    }

    pickedByTipo.set(item.tipo, tape);
  }

  // B. Interleave tipos (proportional round-robin + max_musicas_seguidas)
  const orderedItems: ContentLike[] = [];
  const validReceita = receita.filter((r) => TIPOS_VALIDOS_CONTENTS.includes(r.tipo));
  const totalBuckets = validReceita.map((r) => ({
    tipo: r.tipo,
    items: pickedByTipo.get(r.tipo) ?? [],
  }));

  const cursors = new Map<string, number>();
  for (const b of totalBuckets) cursors.set(b.tipo, 0);

  let consecutiveSame = 0;
  let lastTipo = "";
  let anyAdded = true;

  while (anyAdded) {
    anyAdded = false;
    for (const bucket of totalBuckets) {
      const cursor = cursors.get(bucket.tipo) ?? 0;
      if (cursor >= bucket.items.length) continue;

      if (bucket.tipo === "musica" && lastTipo === "musica" && consecutiveSame >= maxMusSeguid) {
        continue;
      }

      orderedItems.push(bucket.items[cursor]!);
      cursors.set(bucket.tipo, cursor + 1);
      anyAdded = true;

      if (bucket.tipo === lastTipo) {
        consecutiveSame++;
      } else {
        consecutiveSame = 1;
        lastTipo = bucket.tipo;
      }
    }
  }

  // Flush items that were stranded when max_musicas_seguidas caused early exit
  // (happens when musica is the last remaining tipo and consecutive cap is hit)
  for (const bucket of totalBuckets) {
    let cursor = cursors.get(bucket.tipo) ?? 0;
    while (cursor < bucket.items.length) {
      orderedItems.push(bucket.items[cursor]!);
      cursor++;
    }
    cursors.set(bucket.tipo, cursor);
  }

  // C. Count by tipo
  const counts: Record<string, number> = {};
  for (const item of orderedItems) {
    counts[item.tipo] = (counts[item.tipo] ?? 0) + 1;
  }

  return { items: orderedItems, counts, pool_warnings };
}

/* ─── ResolveService ─────────────────────────────────────────────────────── */

export class ResolveService {
  async resolve(
    programaId: number,
    channelId: number,
    date: string,
    startsAt: string | null = null,
    seedExtra?: string,
  ): Promise<ResolveResult> {
    const programa = await Programa.findByPk(programaId);
    if (!programa) throw new HttpError(`Programa ${programaId} não encontrado`, 404);

    const receita: ReceitaItem[] = programa.receita;
    const regras: RegrasPrograma = programa.regras;
    const totalSec = programa.duracao_min * 60;
    const antiDias = regras.anti_repeticao_dias ?? 3;
    const maxMusSeguid = regras.max_musicas_seguidas ?? 3;

    // 1. Load recently played content IDs for anti-repetition
    const cutoff = new Date(Date.now() - antiDias * 24 * 60 * 60 * 1000);
    const recentlyPlayed = await PlayHistory.findAll({
      where: { channel_id: channelId, played_at: { [Op.gte]: cutoff } },
      attributes: ["content_id"],
    });
    const recentIds = new Set(recentlyPlayed.map((p) => p.content_id));

    // 2. Load and shuffle content pools per tipo
    const seedStr = `${date}-${channelId}-${programaId}-${seedExtra ?? ""}`;
    const rng = mulberry32(hashSeed(seedStr));

    const poolsByTipo = new Map<string, ContentLike[]>();
    for (const item of receita) {
      if (!TIPOS_VALIDOS_CONTENTS.includes(item.tipo)) {
        logger.warn("[ResolveService] Tipo inválido ignorado na receita", {
          tipo: item.tipo,
          programa: programa.nome,
          programaId,
        });
        continue;
      }

      const pool = await Content.findAll({
        where: ({
          tipo: item.tipo,
          // ativo may be null on legacy rows — treat null as true
          ativo: { [Op.not]: false },
          // Must have a playable audio file — prevents unresolvable items from
          // entering the playlist and causing a "between_blocks" gap at runtime.
          audio_url: { [Op.not]: null },
          duracao: { [Op.gt]: 0, [Op.ne]: null },
          // M:N join (content_channels) OR legacy direct FK — whichever is set
          [Op.or]: [
            { "$channels.id$": channelId },
            { channel_id: channelId },
          ],
        }) as Record<string, unknown>,
        include: [{
          model: Channel,
          as: "channels",
          // LEFT JOIN so rows without a content_channels entry still pass the
          // OR above via the legacy channel_id column
          required: false,
          through: { attributes: [] },
          attributes: ["id"],
        }],
        attributes: ["id", "titulo", "tipo", "duracao", "audio_url", "mixed_audio_url", "imagem_url"],
        // DISTINCT avoids duplicate rows when a content has multiple content_channels entries
        group: ["Content.id"],
      });

      // Prefer non-recently-played; fall back to all if pool would be empty
      const fresh = pool.filter((c) => !recentIds.has(c.id));
      const available = fresh.length > 0 ? fresh : pool;
      const shuffled = shuffleWithSeed(available, rng);
      poolsByTipo.set(item.tipo, shuffled);

      logger.info("ResolveService: content pool", {
        programaId, channelId, tipo: item.tipo,
        total: pool.length, fresh: fresh.length, available: available.length,
      });
    }

    // 3 + 4. Fill tapes per tipo (looping + rotation) and interleave
    const { items: orderedItems, counts, pool_warnings } = buildFilledTimeline(
      poolsByTipo,
      receita,
      totalSec,
      maxMusSeguid,
      seedStr,
    );

    // Log pool_warnings at warn level so they surface in production logs
    for (const w of pool_warnings) {
      logger.warn("[ResolveService] pool warning", { programaId, channelId, warning: w });
    }

    // 5. Apply abre_com / fecha_com rules
    let finalItems = [...orderedItems];
    let trocas = 0;

    if (regras.abre_com) {
      const abridx = finalItems.findIndex((c) => c.tipo === regras.abre_com);
      if (abridx > 0) {
        const [opening] = finalItems.splice(abridx, 1);
        finalItems.unshift(opening!);
        trocas++;
      }
    }

    if (regras.fecha_com) {
      let fechidx = -1;
      for (let i = finalItems.length - 1; i >= 0; i--) {
        if (finalItems[i]!.tipo === regras.fecha_com) { fechidx = i; break; }
      }
      if (fechidx >= 0 && fechidx < finalItems.length - 1) {
        const [closing] = finalItems.splice(fechidx, 1);
        finalItems.push(closing!);
        trocas++;
      }
    }

    // 6. Calculate real duration and assign starts_at timestamps
    const duracao_real_sec = finalItems.reduce((s, c) => s + (c.duracao ?? 0), 0);
    const vazio_sec = Math.max(0, totalSec - duracao_real_sec);

    let currentTime = startsAt;
    const resolvedItems: ResolvedItem[] = finalItems.map((c, i) => {
      const itemStartsAt = currentTime;
      if (currentTime) {
        currentTime = addSecondsToIso(currentTime, c.duracao ?? 0);
      }
      const audioUrl = (c as ContentLike & { mixed_audio_url?: string | null }).mixed_audio_url ?? c.audio_url ?? null;
      return {
        ordem: i + 1,
        content_id: c.id,
        titulo: c.titulo,
        tipo: c.tipo,
        duration_sec: c.duracao ?? 0,
        starts_at: itemStartsAt,
        audio_url: audioUrl,
        content: {
          id: c.id,
          titulo: c.titulo,
          tipo: c.tipo,
          audio_url: audioUrl,
          imagem_url: c.imagem_url ?? null,
          duracao: c.duracao ?? 0,
        },
      };
    });

    // 7. Record play_history (non-blocking)
    const now = new Date();
    PlayHistory.bulkCreate(
      finalItems.map((c) => ({
        content_id: c.id,
        channel_id: channelId,
        played_at: now,
        programa_id: programaId,
      })),
    ).catch(() => {});

    logger.info("ResolveService.resolve", {
      programaId,
      channelId,
      date,
      items: resolvedItems.length,
      duracao_real_sec,
      vazio_sec,
      counts,
      under_filled: duracao_real_sec < totalSec * 0.9,
    });

    return {
      programa: { id: programa.id, nome: programa.nome, duracao_min: programa.duracao_min },
      starts_at: startsAt,
      duracao_real_sec,
      total_duration_sec: duracao_real_sec,
      items: resolvedItems,
      ajustes: { vazio_sec, trocas },
      counts,
      pool_warnings,
    };
  }
}

export const resolveService = new ResolveService();

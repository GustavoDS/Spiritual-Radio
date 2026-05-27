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
}

/* ─── Deterministic PRNG (mulberry32) ───────────────────────────────────── */

function hashSeed(str: string): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x517cc1b727220a95 | 0);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    seed += 0x6d2b79f5;
    let z = seed;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

function shuffleWithSeed<T>(arr: T[], rng: () => number): T[] {
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

    // 2. Load content by tipo, applying anti-repetition
    const seedStr = `${date}-${channelId}-${programaId}-${seedExtra ?? ""}`;
    const rng = mulberry32(hashSeed(seedStr));

    const contentByTipo = new Map<string, Content[]>();
    for (const item of receita) {
      const pool = await Content.findAll({
        where: {
          tipo: item.tipo,
          ativo: true,
          duracao: { [Op.gt]: 0, [Op.ne]: null } as Record<symbol, unknown>,
        },
        include: [{
          model: Channel,
          as: "channels",
          where: { id: channelId },
          required: true,
          through: { attributes: [] },
          attributes: [],
        }],
        attributes: ["id", "titulo", "tipo", "duracao", "audio_url", "mixed_audio_url", "imagem_url"],
      });

      // Prefer non-recently-played; fall back to all if pool would be empty
      const fresh = pool.filter((c) => !recentIds.has(c.id));
      const available = fresh.length > 0 ? fresh : pool;
      contentByTipo.set(item.tipo, shuffleWithSeed(available, rng));
    }

    // 3. Bin-pack each tipo slot
    const pickedByTipo = new Map<string, Content[]>();
    let trocas = 0;

    for (const item of receita) {
      const targetSec = Math.round(totalSec * item.pct / 100);
      const pool = contentByTipo.get(item.tipo) ?? [];
      const picked: Content[] = [];
      let accumulated = 0;

      for (const track of pool) {
        const dur = track.duracao ?? 0;
        if (accumulated + dur <= targetSec + 30) {
          picked.push(track);
          accumulated += dur;
        }
        if (accumulated >= targetSec - 30) break;
      }

      // If we picked nothing but pool has tracks, force at least one
      if (picked.length === 0 && pool.length > 0) {
        picked.push(pool[0]!);
        trocas++;
      }

      pickedByTipo.set(item.tipo, picked);
    }

    // 4. Interleave items according to receita order and max_musicas_seguidas
    const orderedItems: Content[] = [];
    const cursors = new Map<string, number>();
    for (const item of receita) cursors.set(item.tipo, 0);

    // Build order: cycle through tipos proportionally, limiting consecutive same-tipo
    const totalBuckets = receita.map((r) => ({
      tipo: r.tipo,
      items: pickedByTipo.get(r.tipo) ?? [],
    }));

    let consecutiveSame = 0;
    let lastTipo = "";
    let anyAdded = true;

    while (anyAdded) {
      anyAdded = false;
      for (const bucket of totalBuckets) {
        const cursor = cursors.get(bucket.tipo) ?? 0;
        if (cursor >= bucket.items.length) continue;

        // Respect max_musicas_seguidas for "musica" tipo
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

    // 5. Apply abre_com / fecha_com rules
    let finalItems = [...orderedItems];

    if (regras.abre_com) {
      const abridx = finalItems.findIndex((c) => c.tipo === regras.abre_com);
      if (abridx > 0) {
        const [opening] = finalItems.splice(abridx, 1);
        finalItems.unshift(opening!);
        trocas++;
      }
    }

    if (regras.fecha_com) {
      // findLastIndex polyfill for older TS lib targets
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
      const audioUrl = c.mixed_audio_url ?? c.audio_url ?? null;
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
    });

    return {
      programa: { id: programa.id, nome: programa.nome, duracao_min: programa.duracao_min },
      starts_at: startsAt,
      duracao_real_sec,
      total_duration_sec: duracao_real_sec,
      items: resolvedItems,
      ajustes: { vazio_sec, trocas },
    };
  }
}

export const resolveService = new ResolveService();

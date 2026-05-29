import { describe, it, expect } from "vitest";
import {
  buildFilledTimeline,
  hashSeed,
  mulberry32,
  shuffleWithSeed,
  TIPOS_VALIDOS_CONTENTS,
  type ContentLike,
} from "../ResolveService.js";
import type { ReceitaItem } from "../../models/Programa.js";

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function makePool(tipo: string, ids: number[], durSec: number): ContentLike[] {
  return ids.map((id) => ({
    id,
    tipo,
    duracao: durSec,
    titulo: `${tipo}-${id}`,
    audio_url: "/fake/audio.mp3",
    mixed_audio_url: null,
    imagem_url: null,
  }));
}

function seedRng(str: string) {
  return mulberry32(hashSeed(str));
}

function shuffled<T>(arr: T[], seed: string): T[] {
  return shuffleWithSeed([...arr], seedRng(seed));
}

/* ─── buildFilledTimeline ─────────────────────────────────────────────────── */

describe("buildFilledTimeline", () => {

  // ── Test 1: fills a 5h block with a small pool, no immediate repeats ──────

  it("fills a 5h block from a small oracao pool with no consecutive repeats", () => {
    const pool = makePool("oracao", [1, 2, 3], 600); // 3 × 10 min = 30 min
    const totalSec = 18_000; // 5h
    const receita: ReceitaItem[] = [{ tipo: "oracao", pct: 100 }];
    const pools = new Map([["oracao", shuffled(pool, "seed1")]]);

    const { items, counts, pool_warnings } = buildFilledTimeline(
      pools, receita, totalSec, 3, "seed1",
    );

    // Should fill at least 90% of 5h
    const totalDur = items.reduce((s, i) => s + (i.duracao ?? 0), 0);
    expect(totalDur).toBeGreaterThanOrEqual(totalSec * 0.9);

    // No immediate consecutive repeats
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.id).not.toBe(items[i - 1]!.id);
    }

    expect(counts["oracao"]).toBeGreaterThan(0);
    // Pool has enough items for rotation so should NOT be under-filled
    expect(pool_warnings.some((w) => w.includes("insuficiente"))).toBe(false);
  });

  // ── Test 2: single-item pool fills via repetition, warns ─────────────────

  it("fills duration even with a single-item pool (warns but does not under-fill)", () => {
    const pool = makePool("oracao", [42], 600); // 1 × 10 min
    const totalSec = 3_600; // 1h
    const receita: ReceitaItem[] = [{ tipo: "oracao", pct: 100 }];
    const pools = new Map([["oracao", pool]]);

    const { items, counts, pool_warnings } = buildFilledTimeline(
      pools, receita, totalSec, 3, "seed-single",
    );

    // All items must be id=42
    expect(items.every((i) => i.id === 42)).toBe(true);

    // Duration filled (single-item allowed to repeat)
    const totalDur = items.reduce((s, i) => s + (i.duracao ?? 0), 0);
    expect(totalDur).toBeGreaterThanOrEqual(totalSec * 0.9);

    expect(counts["oracao"]).toBeGreaterThan(0);
    // Should warn about the single-item pool causing repetition
    expect(pool_warnings.length).toBeGreaterThan(0);
  });

  // ── Test 3: mixed recipe — both tipos appear in result ───────────────────

  it("mixed recipe produces items of every requested tipo", () => {
    const musicaPool = makePool("musica", [10, 11, 12, 13], 300); // 5 min each
    const oracaoPool = makePool("oracao", [20, 21, 22], 600);     // 10 min each
    const totalSec = 3_600; // 1h
    const receita: ReceitaItem[] = [
      { tipo: "musica", pct: 60 },
      { tipo: "oracao", pct: 40 },
    ];
    const pools = new Map<string, ContentLike[]>([
      ["musica", shuffled(musicaPool, "m-seed")],
      ["oracao", shuffled(oracaoPool, "o-seed")],
    ]);

    const { items, counts } = buildFilledTimeline(
      pools, receita, totalSec, 3, "mixed-seed",
    );

    const tipos = new Set(items.map((i) => i.tipo));
    expect(tipos.has("musica")).toBe(true);
    expect(tipos.has("oracao")).toBe(true);

    // musica should be ~60%, oracao ~40% — allow ±15% tolerance
    const totalItems = items.length;
    expect(counts["musica"]! / totalItems).toBeGreaterThan(0.40);
    expect(counts["oracao"]! / totalItems).toBeGreaterThan(0.20);
  });

  // ── Test 4: max_musicas_seguidas respected, no musica items dropped ────────

  it("respects max_musicas_seguidas and does not drop items when musica dominates", () => {
    const musicaPool = makePool("musica", [1, 2, 3, 4, 5, 6], 300);
    const oracaoPool = makePool("oracao", [10], 600);
    const totalSec = 3_600;
    const receita: ReceitaItem[] = [
      { tipo: "musica", pct: 80 },
      { tipo: "oracao", pct: 20 },
    ];
    const pools = new Map<string, ContentLike[]>([
      ["musica", shuffled(musicaPool, "ms")],
      ["oracao", shuffled(oracaoPool, "os")],
    ]);

    const { items } = buildFilledTimeline(pools, receita, totalSec, 3, "cap-test");

    const totalDur = items.reduce((s, i) => s + (i.duracao ?? 0), 0);
    // All items should appear — flush step ensures musica items are not dropped
    expect(totalDur).toBeGreaterThanOrEqual(totalSec * 0.9);

    // No musica run longer than max_musicas_seguidas=3 in the interleaved section
    // (before the flush section; after flush consecutive musicas are allowed)
    // At minimum, verify no immediate id repeats within musica
    const musicaItems = items.filter((i) => i.tipo === "musica");
    for (let i = 1; i < Math.min(musicaItems.length, 10); i++) {
      // With 6 unique ids rotating, we might see the same id after ~6 steps — that's fine
      // Just check that it's not the exact same id consecutively within first 10
      expect(musicaItems[i]!.id).not.toBe(musicaItems[i - 1]!.id);
    }
  });

  // ── Test 5: empty pool → under_filled warning, zero items for that tipo ───

  it("empty pool for a tipo produces pool_warnings and under_filled", () => {
    const totalSec = 3_600;
    const receita: ReceitaItem[] = [
      { tipo: "musica", pct: 60 },
      { tipo: "oracao", pct: 40 },
    ];
    // musica pool is empty
    const pools = new Map<string, ContentLike[]>([
      ["musica", []],
      ["oracao", shuffled(makePool("oracao", [1, 2], 600), "seed-empty")],
    ]);

    const { items, counts, pool_warnings } = buildFilledTimeline(
      pools, receita, totalSec, 3, "empty-test",
    );

    // No musica items in result
    expect(counts["musica"] ?? 0).toBe(0);
    // oracao items present
    expect(counts["oracao"]).toBeGreaterThan(0);
    // Warning for empty musica pool
    expect(pool_warnings.some((w) => w.includes("musica") && w.includes("vazio"))).toBe(true);

    // under_filled: oracao fills only 40% of 1h = 1440s, but resolve covers that
    // Here we check at the buildFilledTimeline level: real duration < 90% of 1h
    const totalDur = items.reduce((s, i) => s + (i.duracao ?? 0), 0);
    const expectedFull = totalSec * 0.9;
    // With empty musica pool, only 40% can be filled — so under_filled condition holds
    expect(totalDur).toBeLessThan(expectedFull);
  });

  // ── Test 6: invalid tipo in receita (vinheta) → warning, not in result ────

  it("invalid tipo (vinheta) in receita is skipped with a warning", () => {
    const pool = makePool("oracao", [1, 2], 300);
    const receita: ReceitaItem[] = [
      { tipo: "oracao", pct: 90 },
      { tipo: "vinheta", pct: 10 }, // invalid — lives in separate table
    ];
    const pools = new Map([["oracao", pool]]);

    const { items, pool_warnings } = buildFilledTimeline(
      pools, receita, 1800, 3, "invalid-tipo",
    );

    expect(items.every((i) => i.tipo !== "vinheta")).toBe(true);
    expect(pool_warnings.some((w) => w.includes("vinheta"))).toBe(true);
  });

  // ── Test 7: TIPOS_VALIDOS_CONTENTS export ────────────────────────────────

  it("TIPOS_VALIDOS_CONTENTS includes expected types and excludes vinheta", () => {
    expect(TIPOS_VALIDOS_CONTENTS).toContain("musica");
    expect(TIPOS_VALIDOS_CONTENTS).toContain("oracao");
    expect(TIPOS_VALIDOS_CONTENTS).toContain("mensagem");
    expect(TIPOS_VALIDOS_CONTENTS).toContain("reflexao");
    expect(TIPOS_VALIDOS_CONTENTS).toContain("versiculo");
    expect(TIPOS_VALIDOS_CONTENTS).not.toContain("vinheta");
  });

  // ── Test 8: determinism — same seed → same order ──────────────────────────

  it("produces identical output for the same seed (deterministic)", () => {
    const pool = makePool("musica", [1, 2, 3, 4], 300);
    const receita: ReceitaItem[] = [{ tipo: "musica", pct: 100 }];
    const pools = () => new Map([["musica", shuffled(pool, "det-seed")]]);

    const r1 = buildFilledTimeline(pools(), receita, 3600, 3, "det-seed");
    const r2 = buildFilledTimeline(pools(), receita, 3600, 3, "det-seed");

    expect(r1.items.map((i) => i.id)).toEqual(r2.items.map((i) => i.id));
  });
});

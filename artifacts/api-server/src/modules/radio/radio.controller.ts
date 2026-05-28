import type { Request, Response } from "express";
import { radioService } from "../../services/RadioService.js";
import { vinhetaInjectionService } from "../../services/VinhetaInjectionService.js";
import { playlistMaterializationService } from "../../services/PlaylistMaterializationService.js";
import { autoDjService } from "../../services/AutoDJService.js";
import { gradeProgramasService } from "../grade-programas/grade-programas.service.js";
import { ok } from "../../utils/response.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { env } from "../../config/env.js";

export async function getCurrent(req: Request, res: Response): Promise<void> {
  const channelId = req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined;
  ok(res, await radioService.getCurrentContent(channelId));
}

export async function getNext(req: Request, res: Response): Promise<void> {
  const channelId = req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined;
  ok(res, await radioService.getNextContent(channelId));
}

/**
 * GET /api/radio/schedule  (also exposed at GET /api/public/radio/schedule)
 *
 * Returns the effective day schedule for a channel built from grade_programas
 * + programas — each item has the real program name, bloco as `tipo`, and the
 * correct horario_fim derived from programa.duracao_min.
 *
 * Query params:
 *   channel_id — default: env.defaultChannelId
 *   date       — YYYY-MM-DD, default: today (UTC)
 */
export async function getSchedule(req: Request, res: Response): Promise<void> {
  const channelId = req.query["channel_id"]
    ? Number(req.query["channel_id"])
    : env.defaultChannelId;

  const date = req.query["date"]
    ? String(req.query["date"])
    : new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError("Parâmetro date inválido. Use o formato YYYY-MM-DD.", 400);
  }

  ok(res, await gradeProgramasService.getPublicDaySchedule(channelId, date));
}

/**
 * GET /api/radio/queue?date=YYYY-MM-DD&channel_id=N
 *
 * Returns the full day playlist with vinhetas injected according to the block
 * rules (abertura, encerramento, transicao, antes_de_*).
 */
export async function getQueue(req: Request, res: Response): Promise<void> {
  const channelId = req.query["channel_id"]
    ? Number(req.query["channel_id"])
    : env.defaultChannelId;

  const date = req.query["date"]
    ? String(req.query["date"])
    : new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError("Parâmetro date inválido. Use o formato YYYY-MM-DD.", 400);
  }

  const result = await vinhetaInjectionService.buildQueue(channelId, date);
  ok(res, result);
}

/**
 * POST /api/radio/regenerate
 * Força a rematerialização da playlist do dia para um ou todos os canais.
 * Body: { channel_id?: number, date?: string }
 * Após materializar, recarrega o estado do AutoDJ para o canal.
 */
export async function regenerate(req: Request, res: Response): Promise<void> {
  const body = req.body as { channel_id?: unknown; date?: unknown };
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10);

  if (body.channel_id !== undefined) {
    const channelId = Number(body.channel_id);
    if (!Number.isFinite(channelId) || channelId <= 0) {
      throw new HttpError("channel_id deve ser um inteiro positivo", 400);
    }
    // When an explicit date is given, materialize only that date; otherwise
    // materialize today + tomorrow (same as the background timer).
    if (body.date) {
      const result = await playlistMaterializationService.materializeDay(channelId, date);
      await autoDjService.reload(channelId);
      ok(res, result, `Fila regenerada: ${result.items_created} itens para canal ${channelId} em ${date}`);
    } else {
      const today = new Date().toISOString().split("T")[0]!;
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split("T")[0]!;
      const [r1, r2] = await Promise.all([
        playlistMaterializationService.materializeDay(channelId, today),
        playlistMaterializationService.materializeDay(channelId, tomorrow),
      ]);
      await autoDjService.reload(channelId);
      ok(res, { results: [r1, r2], total_items: r1.items_created + r2.items_created }, `Fila regenerada para canal ${channelId}: ${r1.items_created + r2.items_created} itens (hoje + amanhã)`);
    }
  } else {
    // No channel_id: materialize all channels. Pass `date` only when explicitly
    // provided; otherwise materializeAllChannels() handles today + tomorrow.
    const results = await playlistMaterializationService.materializeAllChannels(body.date ? date : undefined);
    for (const r of results) {
      await autoDjService.reload(r.channel_id).catch(() => {});
    }
    const totalItems = results.reduce((s, r) => s + r.items_created, 0);
    const label = body.date ? `em ${date}` : "hoje + amanhã";
    ok(res, { results, total_items: totalItems }, `Fila regenerada para ${results.length} canal(is): ${totalItems} itens (${label})`);
  }
}

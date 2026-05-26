import type { Request, Response } from "express";
import { radioService } from "../../services/RadioService.js";
import { vinhetaInjectionService } from "../../services/VinhetaInjectionService.js";
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

export async function getSchedule(req: Request, res: Response): Promise<void> {
  const channelId = req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined;
  ok(res, await radioService.getDaySchedule(channelId));
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

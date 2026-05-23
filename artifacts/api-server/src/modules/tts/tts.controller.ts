import type { Request, Response } from "express";
import { voiceService } from "../../services/VoiceService.js";
import { mixService } from "../../services/MixService.js";
import { ok } from "../../utils/response.js";
import { HttpError } from "../../middlewares/errorHandler.js";

export async function synthesize(req: Request, res: Response): Promise<void> {
  const { voiceId, text } = req.body as { voiceId: number; text: string };
  const result = await voiceService.synthesize({ voiceId, text });
  ok(res, result, result.cached ? "Áudio recuperado do cache" : result.queued ? "Síntese enfileirada" : "Síntese concluída");
}

export async function mix(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;

  if (!body["voiceId"] || !body["text"] || !body["bedUrl"]) {
    throw new HttpError("Campos obrigatórios: voiceId, text, bedUrl", 400);
  }

  const result = await mixService.mix({
    voiceId: Number(body["voiceId"]),
    text: String(body["text"]),
    bedUrl: String(body["bedUrl"]),
    duckDb: body["duckDb"] !== undefined ? Number(body["duckDb"]) : undefined,
    fadeInMs: body["fadeInMs"] !== undefined ? Number(body["fadeInMs"]) : undefined,
    fadeOutMs: body["fadeOutMs"] !== undefined ? Number(body["fadeOutMs"]) : undefined,
    tailMs: body["tailMs"] !== undefined ? Number(body["tailMs"]) : undefined,
    bedGainDb: body["bedGainDb"] !== undefined ? Number(body["bedGainDb"]) : undefined,
    voiceGainDb: body["voiceGainDb"] !== undefined ? Number(body["voiceGainDb"]) : undefined,
    normalizeLufs: body["normalizeLufs"] !== undefined ? Number(body["normalizeLufs"]) : undefined,
  });

  ok(res, result, result.cached ? "Mix recuperado do cache" : "Mix concluído");
}

import type { Request, Response } from "express";
import { voiceService } from "../../services/VoiceService.js";
import { mixService } from "../../services/MixService.js";
import { voiceSynthesisQueue } from "../../queues/index.js";
import { ok } from "../../utils/response.js";
import { HttpError } from "../../middlewares/errorHandler.js";

export async function synthesize(req: Request, res: Response): Promise<void> {
  const { voiceId, text } = req.body as { voiceId: number; text: string };
  const result = await voiceService.synthesize({ voiceId, text });
  ok(res, result, result.cached ? "Áudio recuperado do cache" : result.queued ? "Síntese enfileirada" : "Síntese concluída");
}

export async function getJobStatus(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };

  let job: Awaited<ReturnType<typeof voiceSynthesisQueue.getJob>>;
  try {
    job = await voiceSynthesisQueue.getJob(id);
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.includes("ECONNREFUSED") || msg.includes("connect") || msg.includes("Redis")) {
      throw new HttpError("Redis indisponível — não é possível consultar o status do job", 503);
    }
    throw err;
  }

  if (!job) {
    throw new HttpError(`Job ${id} não encontrado (expirado ou nunca existiu)`, 404);
  }

  const state = await job.getState();
  const progress = job.progress;
  const failedReason = job.failedReason ?? null;
  const result = job.returnvalue as { url?: string; voiceId?: number; contentId?: number } | null;

  ok(res, {
    jobId: id,
    status: state,           // "waiting" | "active" | "completed" | "failed" | "delayed"
    progress,
    url: result?.url ?? null, // null until completed
    voiceId: result?.voiceId ?? (job.data as { voiceId?: number }).voiceId ?? null,
    contentId: result?.contentId ?? null,
    error: failedReason,
    createdAt: new Date(job.timestamp).toISOString(),
  }, state === "completed" ? "Job concluído" : `Job em estado: ${state}`);
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

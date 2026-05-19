import type { Request, Response } from "express";
import { voiceService } from "../../services/VoiceService.js";
import { ok } from "../../utils/response.js";

export async function synthesize(req: Request, res: Response): Promise<void> {
  const { voiceId, text } = req.body as { voiceId: number; text: string };
  const result = await voiceService.synthesize({ voiceId, text });
  ok(res, result, result.cached ? "Áudio recuperado do cache" : result.queued ? "Síntese enfileirada" : "Síntese concluída");
}

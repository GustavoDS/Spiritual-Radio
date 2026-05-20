import fs from "fs";
import path from "path";
import crypto from "crypto";
import { logger } from "../lib/logger.js";
import { Voice, AiEvent } from "../models/index.js";
import { voiceSynthesisQueue } from "../queues/index.js";
import { env } from "../config/env.js";
import { synthesizeOpenAI } from "./tts/openaiTts.js";
import { synthesizeElevenLabs } from "./tts/elevenlabsTts.js";
import { storageProvider } from "../storage/index.js";
import { redis } from "../config/redis.js";

function estimateTtsCost(provider: string, chars: number): number {
  if (provider === "elevenlabs") return chars * 0.00003; // ~$30/1M chars
  return chars * 0.000015; // OpenAI TTS-1: ~$15/1M chars
}

function recordTtsEvent(opts: {
  provider: string;
  charsIn: number;
  durationMs: number;
  audioDurationSec: number | null;
  success: boolean;
  error?: string;
  contentId?: number;
}): void {
  AiEvent.create({
    event_type: "tts_synthesis",
    provider: opts.provider,
    model: env.ttsModel || null,
    chars_in: opts.charsIn,
    tokens_est: null,
    cost_usd_est: opts.success ? estimateTtsCost(opts.provider, opts.charsIn) : 0,
    duration_ms: opts.durationMs,
    success: opts.success,
    error: opts.error ?? null,
    content_id: opts.contentId ?? null,
    audio_duration_sec: opts.audioDurationSec,
  }).catch((err) => {
    logger.debug("TTS AiEvent.create failed (non-fatal)", { err: (err as Error).message });
  });
}

export interface SynthesisOptions {
  text: string;
  voiceId: number;
  outputPath?: string;
  contentId?: number;
}

export interface SynthesisResult {
  filePath: string;
  url: string;
  queued: boolean;
  jobId?: string;
  cached?: boolean;
}

const TTS_CACHE_TTL = 7 * 24 * 3600;

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildLocalOutputPath(): string {
  const audioDir = path.join(env.uploadDir, "audio");
  ensureDir(audioDir);
  const filename = `tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
  return path.join(audioDir, filename);
}

function buildStorageKey(): string {
  return `audio/tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
}

function ttsCacheKey(text: string, voiceId: number): string {
  return `tts:${crypto.createHash("sha256").update(`${text}:${voiceId}`).digest("hex")}`;
}

export async function runSynthesis(text: string, voice: Voice): Promise<{ filePath: string; url: string }> {
  if (!env.ttsApiKey) {
    throw new Error("TTS_API_KEY não configurado — defina a variável de ambiente antes de usar a síntese de voz");
  }

  const provider = voice.provider === "elevenlabs" ? "elevenlabs" : env.ttsProvider;
  const voiceIdentifier = voice.voice_id_externo ?? voice.nome;
  logger.info("runSynthesis started", { provider, voiceIdentifier, textLength: text.length });

  const t0 = Date.now();
  let audioBuffer: Buffer;
  try {
    if (provider === "elevenlabs") {
      audioBuffer = await synthesizeElevenLabs(text, voiceIdentifier);
    } else {
      audioBuffer = await synthesizeOpenAI(text, voiceIdentifier);
    }
  } catch (err) {
    recordTtsEvent({
      provider,
      charsIn: text.length,
      durationMs: Date.now() - t0,
      audioDurationSec: null,
      success: false,
      error: (err as Error).message,
    });
    throw err;
  }

  const localPath = buildLocalOutputPath();
  fs.writeFileSync(localPath, audioBuffer);
  logger.info("TTS audio buffer written to disk", { localPath, bytes: audioBuffer.length });

  const storageKey = buildStorageKey();
  const url = await storageProvider.upload(localPath, storageKey);

  // Estimate audio duration: MP3 at 128kbps ≈ 16KB/sec
  const audioDurationSec = audioBuffer.length / 16000;
  const durationMs = Date.now() - t0;

  logger.info("runSynthesis complete", { provider, storageKey, url, bytes: audioBuffer.length, durationMs });

  recordTtsEvent({ provider, charsIn: text.length, durationMs, audioDurationSec, success: true });

  return { filePath: localPath, url };
}

export class VoiceService {
  async synthesize(opts: SynthesisOptions): Promise<SynthesisResult> {
    logger.info("VoiceService.synthesize", { voiceId: opts.voiceId, textLength: opts.text.length });

    const voice = await Voice.findByPk(opts.voiceId);
    if (!voice) throw new Error(`Voz com id ${opts.voiceId} não encontrada`);

    const cacheKey = ttsCacheKey(opts.text, opts.voiceId);
    try {
      const cachedUrl = await redis.get(cacheKey);
      if (cachedUrl) {
        logger.info("VoiceService.synthesize: cache hit", { voiceId: opts.voiceId });
        return { filePath: "", url: cachedUrl, queued: false, cached: true };
      }
    } catch { /* redis unavailable */ }

    const outputPath = opts.outputPath ?? buildLocalOutputPath();

    try {
      const job = await voiceSynthesisQueue.add("synthesize", {
        contentId: opts.contentId ?? 0,
        voiceId: opts.voiceId,
        text: opts.text,
        outputPath,
      });
      logger.info("Voice synthesis job queued", { jobId: job.id });
      return { filePath: outputPath, url: storageProvider.getUrl(outputPath), queued: true, jobId: String(job.id) };
    } catch {
      logger.warn("Redis unavailable — synthesizing inline", { voiceId: opts.voiceId });
      const result = await runSynthesis(opts.text, voice);

      try {
        await redis.setex(cacheKey, TTS_CACHE_TTL, result.url);
      } catch { /* ignore */ }

      return { ...result, queued: false };
    }
  }

  async getAvailableVoices(): Promise<Voice[]> {
    return Voice.findAll({ where: { ativo: true }, order: [["nome", "ASC"]] });
  }

  async getVoiceForTime(hora: number): Promise<Voice | null> {
    const periodo = hora >= 6 && hora < 12 ? "manha" : hora >= 12 && hora < 18 ? "tarde" : "noite";
    return Voice.findOne({ where: { horario_preferencial: periodo, ativo: true } });
  }
}

export const voiceService = new VoiceService();

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { spawn } from "child_process";
import { logger } from "../lib/logger.js";
import { Voice } from "../models/index.js";
import { storageProvider } from "../storage/index.js";
import { synthesizeOpenAI } from "./tts/openaiTts.js";
import { synthesizeElevenLabs } from "./tts/elevenlabsTts.js";
import { redis } from "../config/redis.js";
import { HttpError } from "../middlewares/errorHandler.js";

/* ─── Constants ──────────────────────────────────────────────────────────── */

const MAX_TEXT_CHARS = 5000;
const MAX_BED_BYTES = 20 * 1024 * 1024; // 20 MB
const BED_DOWNLOAD_TIMEOUT_MS = 15_000;
const MIX_CACHE_TTL = 7 * 24 * 3600;   // 7 days in Redis

/* ─── Params & result types ─────────────────────────────────────────────── */

export interface MixParams {
  voiceId: number;
  text: string;
  bedUrl: string;
  duckDb?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  tailMs?: number;
  bedGainDb?: number;
  voiceGainDb?: number;
  normalizeLufs?: number;
}

export interface MixResult {
  url: string;
  duration_sec: number;
  cached: boolean;
  voiceUrl: string;
  bedUrl: string;
}

interface CachedMixMeta {
  url: string;
  duration_sec: number;
  voiceUrl: string;
  bedUrl: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function computeHash(params: MixParams): string {
  const canonical = JSON.stringify({
    voiceId: params.voiceId,
    text: params.text,
    bedUrl: params.bedUrl,
    duckDb: params.duckDb ?? -12,
    fadeInMs: params.fadeInMs ?? 800,
    fadeOutMs: params.fadeOutMs ?? 1500,
    tailMs: params.tailMs ?? 2000,
    bedGainDb: params.bedGainDb ?? -6,
    voiceGainDb: params.voiceGainDb ?? 0,
    normalizeLufs: params.normalizeLufs ?? -16,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function mixCacheKey(hash: string): string {
  return `mix:${hash}`;
}

/** Download a remote URL to a local file, respecting timeout and size limits. */
async function downloadFile(url: string, destPath: string): Promise<void> {
  const { default: https } = await import("https");
  const { default: http } = await import("http");

  const parsedUrl = new URL(url);
  const client = parsedUrl.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new HttpError(`Timeout ao baixar bedUrl (${BED_DOWNLOAD_TIMEOUT_MS}ms)`, 502));
    }, BED_DOWNLOAD_TIMEOUT_MS);

    const req = client.get(url, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        clearTimeout(timeout);
        reject(new HttpError(`Falha ao baixar bedUrl: HTTP ${res.statusCode}`, 502));
        return;
      }

      const contentLength = Number(res.headers["content-length"] ?? 0);
      if (contentLength > MAX_BED_BYTES) {
        clearTimeout(timeout);
        reject(new HttpError(`bedUrl excede o limite de ${MAX_BED_BYTES / 1024 / 1024}MB`, 400));
        return;
      }

      const writeStream = fs.createWriteStream(destPath);
      let received = 0;

      res.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_BED_BYTES) {
          req.destroy();
          writeStream.destroy();
          fs.unlink(destPath, () => {});
          clearTimeout(timeout);
          reject(new HttpError(`bedUrl excede o limite de ${MAX_BED_BYTES / 1024 / 1024}MB`, 400));
        }
      });

      res.pipe(writeStream);

      writeStream.on("finish", () => {
        clearTimeout(timeout);
        resolve();
      });

      writeStream.on("error", (err) => {
        clearTimeout(timeout);
        reject(new HttpError(`Erro ao salvar bedUrl: ${err.message}`, 502));
      });
    });

    req.on("error", (err) => {
      clearTimeout(timeout);
      reject(new HttpError(`Erro de rede ao baixar bedUrl: ${err.message}`, 502));
    });
  });
}

/** Get audio duration in seconds using ffprobe. */
async function getAudioDurationSec(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ];

    const proc = spawn("ffprobe", args);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
        return;
      }
      const dur = parseFloat(stdout.trim());
      if (isNaN(dur)) {
        reject(new Error(`ffprobe returned non-numeric duration: "${stdout.trim()}"`));
      } else {
        resolve(dur);
      }
    });
  });
}

/** Run ffmpeg mixing pipeline. Returns path to the output file. */
async function runFfmpegMix(opts: {
  bedPath: string;
  voicePath: string;
  outputPath: string;
  voiceDurationSec: number;
  duckDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  tailMs: number;
  bedGainDb: number;
  voiceGainDb: number;
  normalizeLufs: number;
}): Promise<void> {
  const fadeInSec = opts.fadeInMs / 1000;
  const fadeOutSec = opts.fadeOutMs / 1000;
  const tailSec = opts.tailMs / 1000;

  // Total mix duration = fade-in + voice + tail
  const totalSec = fadeInSec + opts.voiceDurationSec + tailSec;

  // Start of fade-out: everything except the fade-out duration itself
  const outStart = Math.max(0, totalSec - fadeOutSec);

  // Build the filtergraph.
  // [0] = bed (loops infinitely), [1] = voice
  const filterComplex = [
    `[0:a]volume=${opts.bedGainDb}dB,aloop=loop=-1:size=2e9,afade=t=in:st=0:d=${fadeInSec}[bed_in]`,
    `[1:a]volume=${opts.voiceGainDb}dB,adelay=${opts.fadeInMs}|${opts.fadeInMs}[voice_del]`,
    `[bed_in][voice_del]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=400:makeup=0[ducked]`,
    `[ducked][voice_del]amix=inputs=2:duration=longest:dropout_transition=0[mixed]`,
    `[mixed]afade=t=out:st=${outStart.toFixed(3)}:d=${fadeOutSec},loudnorm=I=${opts.normalizeLufs}:TP=-1.5:LRA=11[out]`,
  ].join(";");

  const args = [
    "-y",
    "-i", opts.bedPath,
    "-i", opts.voicePath,
    "-filter_complex", filterComplex,
    "-map", "[out]",
    "-t", String(totalSec.toFixed(3)),
    "-ac", "2",
    "-ar", "44100",
    "-b:a", "192k",
    opts.outputPath,
  ];

  logger.debug("ffmpeg mix command", { args: args.join(" ") });

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";

    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    proc.on("close", (code) => {
      if (code !== 0) {
        logger.error("ffmpeg mix failed", { code, stderr: stderr.slice(-2000) });
        reject(new HttpError(`Falha no ffmpeg (código ${code}): ${stderr.slice(-500)}`, 500));
      } else {
        resolve();
      }
    });

    proc.on("error", (err) => {
      reject(new HttpError(`Erro ao executar ffmpeg: ${err.message}`, 500));
    });
  });
}

/* ─── MixService ─────────────────────────────────────────────────────────── */

export class MixService {
  async mix(params: MixParams): Promise<MixResult> {
    // 1. Validate input
    if (!params.text || params.text.trim().length === 0) {
      throw new HttpError("text não pode ser vazio", 400);
    }
    if (params.text.length > MAX_TEXT_CHARS) {
      throw new HttpError(`Texto excede ${MAX_TEXT_CHARS} caracteres`, 413);
    }
    if (!params.bedUrl || !/^https?:\/\/.+/.test(params.bedUrl)) {
      throw new HttpError("bedUrl inválida: deve ser uma URL pública http/https", 400);
    }

    const voice = await Voice.findByPk(params.voiceId);
    if (!voice) throw new HttpError(`Voz id=${params.voiceId} não encontrada`, 400);

    // 2. Cache check
    const hash = computeHash(params);
    const cacheKey = mixCacheKey(hash);

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const meta = JSON.parse(cached) as CachedMixMeta;
        logger.info("MixService: cache hit", { hash });
        return { ...meta, cached: true };
      }
    } catch { /* Redis unavailable — proceed */ }

    // 3. Create temp workspace
    const tmpDir = path.join(os.tmpdir(), `tts-mix-${hash}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const voiceTmpPath = path.join(tmpDir, "voice.mp3");
    const bedTmpPath = path.join(tmpDir, "bed.mp3");
    const mixTmpPath = path.join(tmpDir, "mixed.mp3");

    try {
      // 4. Synthesize voice (inline — bypasses BullMQ queue)
      logger.info("MixService: synthesizing voice", { voiceId: params.voiceId, textLen: params.text.length });
      const provider = voice.provider === "elevenlabs" ? "elevenlabs" : "openai";
      const voiceIdentifier = voice.voice_id_externo ?? voice.nome;

      let audioBuffer: Buffer;
      if (provider === "elevenlabs") {
        audioBuffer = await synthesizeElevenLabs(params.text, voiceIdentifier);
      } else {
        audioBuffer = await synthesizeOpenAI(params.text, voiceIdentifier);
      }
      fs.writeFileSync(voiceTmpPath, audioBuffer);

      // 5. Upload voice to storage for the voiceUrl response field
      const voiceStorageKey = `audio/tts-${hash.slice(0, 16)}-voice.mp3`;
      const voiceUrl = await storageProvider.upload(voiceTmpPath, voiceStorageKey);

      // 6. Get voice duration via ffprobe
      const voiceDurationSec = await getAudioDurationSec(voiceTmpPath);
      logger.info("MixService: voice synthesized", { voiceDurationSec });

      // 7. Download bed
      logger.info("MixService: downloading bed", { bedUrl: params.bedUrl });
      await downloadFile(params.bedUrl, bedTmpPath);

      // 8. Run ffmpeg mix
      const duckDb = params.duckDb ?? -12;
      const fadeInMs = params.fadeInMs ?? 800;
      const fadeOutMs = params.fadeOutMs ?? 1500;
      const tailMs = params.tailMs ?? 2000;
      const bedGainDb = params.bedGainDb ?? -6;
      const voiceGainDb = params.voiceGainDb ?? 0;
      const normalizeLufs = params.normalizeLufs ?? -16;

      logger.info("MixService: running ffmpeg", { voiceDurationSec, fadeInMs, fadeOutMs, tailMs });
      await runFfmpegMix({
        bedPath: bedTmpPath,
        voicePath: voiceTmpPath,
        outputPath: mixTmpPath,
        voiceDurationSec,
        duckDb,
        fadeInMs,
        fadeOutMs,
        tailMs,
        bedGainDb,
        voiceGainDb,
        normalizeLufs,
      });

      // 9. Get final duration
      const duration_sec = Math.round(await getAudioDurationSec(mixTmpPath));

      // 10. Upload mixed file
      const mixStorageKey = `audio/mix-${hash}.mp3`;
      const mixUrl = await storageProvider.upload(mixTmpPath, mixStorageKey);
      logger.info("MixService: mix uploaded", { mixUrl, duration_sec });

      // 11. Cache result
      const meta: CachedMixMeta = {
        url: mixUrl,
        duration_sec,
        voiceUrl,
        bedUrl: params.bedUrl,
      };
      try {
        await redis.setex(cacheKey, MIX_CACHE_TTL, JSON.stringify(meta));
      } catch { /* ignore */ }

      return { ...meta, cached: false };

    } finally {
      // 12. Clean up temp files (best effort)
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  }
}

export const mixService = new MixService();

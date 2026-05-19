import fs from "fs";
import path from "path";
import { logger } from "../lib/logger.js";
import { Voice } from "../models/index.js";
import { voiceSynthesisQueue } from "../queues/index.js";
import { env } from "../config/env.js";
import { synthesizeOpenAI } from "./tts/openaiTts.js";
import { synthesizeElevenLabs } from "./tts/elevenlabsTts.js";

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
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildOutputPath(): string {
  const audioDir = path.join(env.uploadDir, "audio");
  ensureDir(audioDir);
  const filename = `tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
  return path.join(audioDir, filename);
}

function filePathToUrl(filePath: string): string {
  return "/" + filePath.replace(/\\/g, "/");
}

export async function runSynthesis(text: string, voice: Voice): Promise<{ filePath: string; url: string }> {
  if (!env.ttsApiKey) {
    throw new Error(
      "TTS_API_KEY não configurado — defina a variável de ambiente antes de usar a síntese de voz",
    );
  }

  const provider = voice.provider === "elevenlabs" ? "elevenlabs" : env.ttsProvider;
  logger.info("runSynthesis", { provider, voiceNome: voice.nome, textLength: text.length });

  let audioBuffer: Buffer;
  if (provider === "elevenlabs") {
    audioBuffer = await synthesizeElevenLabs(text, voice.nome);
  } else {
    audioBuffer = await synthesizeOpenAI(text, voice.nome);
  }

  const filePath = buildOutputPath();
  fs.writeFileSync(filePath, audioBuffer);
  logger.info("Audio file saved", { filePath, bytes: audioBuffer.length });

  return { filePath, url: filePathToUrl(filePath) };
}

export class VoiceService {
  async synthesize(opts: SynthesisOptions): Promise<SynthesisResult> {
    logger.info("VoiceService.synthesize", { voiceId: opts.voiceId, textLength: opts.text.length });

    const voice = await Voice.findByPk(opts.voiceId);
    if (!voice) throw new Error(`Voz com id ${opts.voiceId} não encontrada`);

    const outputPath = opts.outputPath ?? buildOutputPath();

    try {
      const job = await voiceSynthesisQueue.add("synthesize", {
        contentId: opts.contentId ?? 0,
        voiceId: opts.voiceId,
        text: opts.text,
        outputPath,
      });
      logger.info("Voice synthesis job queued", { jobId: job.id });
      return {
        filePath: outputPath,
        url: filePathToUrl(outputPath),
        queued: true,
        jobId: String(job.id),
      };
    } catch {
      logger.warn("Redis unavailable — synthesizing inline", { voiceId: opts.voiceId });
      const result = await runSynthesis(opts.text, voice);
      return { ...result, queued: false };
    }
  }

  async getAvailableVoices(): Promise<Voice[]> {
    return Voice.findAll({ where: { ativo: true }, order: [["nome", "ASC"]] });
  }

  async getVoiceForTime(hora: number): Promise<Voice | null> {
    const periodo =
      hora >= 6 && hora < 12 ? "manha" : hora >= 12 && hora < 18 ? "tarde" : "noite";

    return Voice.findOne({ where: { horario_preferencial: periodo, ativo: true } });
  }
}

export const voiceService = new VoiceService();

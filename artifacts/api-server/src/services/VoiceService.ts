import { logger } from "../lib/logger.js";
import { Voice } from "../models/index.js";
import { voiceSynthesisQueue } from "../queues/index.js";

export interface SynthesisOptions {
  text: string;
  voiceId: number;
  outputPath: string;
  contentId?: number;
}

export class VoiceService {
  async synthesize(opts: SynthesisOptions): Promise<string> {
    logger.info("VoiceService.synthesize", { voiceId: opts.voiceId, textLength: opts.text.length });

    const job = await voiceSynthesisQueue.add("synthesize", {
      contentId: opts.contentId ?? 0,
      voiceId: opts.voiceId,
      text: opts.text,
      outputPath: opts.outputPath,
    });

    logger.info("Voice synthesis job queued", { jobId: job.id });
    return opts.outputPath;
  }

  async getAvailableVoices() {
    return Voice.findAll({ where: { ativo: true }, order: [["nome", "ASC"]] });
  }

  async getVoiceForTime(hora: number): Promise<Voice | null> {
    const periodo =
      hora >= 6 && hora < 12
        ? "manha"
        : hora >= 12 && hora < 18
          ? "tarde"
          : "noite";

    return Voice.findOne({
      where: { horario_preferencial: periodo, ativo: true },
    });
  }
}

export const voiceService = new VoiceService();

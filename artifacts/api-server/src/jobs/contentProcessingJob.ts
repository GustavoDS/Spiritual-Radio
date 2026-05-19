import { Worker, type Job } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { logger } from "../lib/logger.js";
import { Voice } from "../models/index.js";
import { runSynthesis } from "../services/VoiceService.js";
import { Content } from "../models/index.js";

export interface ContentProcessingJobData {
  contentId: number;
  audioPath?: string;
  generateVoice?: boolean;
  voiceId?: number;
  text?: string;
}

export interface VoiceSynthesisJobData {
  contentId: number;
  voiceId: number;
  text: string;
  outputPath: string;
}

export function startContentProcessingWorker(): Worker {
  const worker = new Worker<ContentProcessingJobData>(
    "content-processing",
    async (job: Job<ContentProcessingJobData>) => {
      logger.info("Processing content job", { jobId: job.id, contentId: job.data.contentId });

      const { contentId, generateVoice, voiceId, text } = job.data;

      if (generateVoice && voiceId && text) {
        const voice = await Voice.findByPk(voiceId);
        if (voice) {
          logger.info("Starting voice synthesis via content worker", { contentId, voiceId });
          const { url } = await runSynthesis(text, voice);

          await Content.update(
            { audio_url: url },
            { where: { id: contentId } },
          );
          logger.info("Audio saved and content updated", { contentId, url });
        } else {
          logger.warn("Voice not found for content processing", { voiceId });
        }
      }

      await job.updateProgress(100);
      logger.info("Content processing complete", { contentId });
    },
    { connection: redisConnection, concurrency: 5 },
  );

  worker.on("completed", (job) => logger.info("Job completed", { jobId: job.id }));
  worker.on("failed", (job, err) =>
    logger.error("Job failed", { jobId: job?.id, err: err.message }),
  );

  return worker;
}

export function startVoiceSynthesisWorker(): Worker {
  const worker = new Worker<VoiceSynthesisJobData>(
    "voice-synthesis",
    async (job: Job<VoiceSynthesisJobData>) => {
      logger.info("Processing voice synthesis job", { jobId: job.id, voiceId: job.data.voiceId });

      const { voiceId, text, contentId } = job.data;

      const voice = await Voice.findByPk(voiceId);
      if (!voice) {
        throw new Error(`Voice ${voiceId} not found`);
      }

      const { url } = await runSynthesis(text, voice);
      logger.info("Voice synthesis complete", { jobId: job.id, url });

      if (contentId) {
        await Content.update({ audio_url: url }, { where: { id: contentId } });
        logger.info("Content audio_url updated", { contentId, url });
      }

      await job.updateProgress(100);
    },
    { connection: redisConnection, concurrency: 2 },
  );

  worker.on("completed", (job) => logger.info("Voice synthesis completed", { jobId: job.id }));
  worker.on("failed", (job, err) =>
    logger.error("Voice synthesis failed", { jobId: job?.id, err: err.message }),
  );

  return worker;
}

import { Worker, type Job } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { logger } from "../lib/logger.js";
import { Voice } from "../models/index.js";
import { runSynthesis } from "../services/VoiceService.js";
import { Content } from "../models/index.js";
import { realtimeService } from "../services/RealtimeService.js";

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
          realtimeService.broadcastAdmin("tts_completed", {
            contentId,
            voiceId,
            audioUrl: url,
            trigger: "content_processing",
            ts: new Date().toISOString(),
          });
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
  worker.on("failed", (job, err) => {
    logger.error("Job failed", { jobId: job?.id, err: err.message });
    realtimeService.broadcastAdmin("tts_failed", {
      jobId: job?.id,
      trigger: "content_processing",
      error: err.message,
      ts: new Date().toISOString(),
    });
  });
  worker.on("error", (err) =>
    logger.warn("content-processing worker error (Redis unavailable?)", { err: err.message }),
  );

  return worker;
}

export interface VoiceSynthesisJobResult {
  url: string;
  voiceId: number;
  contentId?: number;
}

export function startVoiceSynthesisWorker(): Worker {
  const worker = new Worker<VoiceSynthesisJobData, VoiceSynthesisJobResult>(
    "voice-synthesis",
    async (job: Job<VoiceSynthesisJobData, VoiceSynthesisJobResult>) => {
      logger.info("Processing voice synthesis job", { jobId: job.id, voiceId: job.data.voiceId });

      const { voiceId, text, contentId } = job.data;

      const voice = await Voice.findByPk(voiceId);
      if (!voice) {
        throw new Error(`Voice ${voiceId} not found`);
      }

      await job.updateProgress(10);
      const { url } = await runSynthesis(text, voice);
      logger.info("Voice synthesis complete", { jobId: job.id, url });
      await job.updateProgress(90);

      if (contentId) {
        await Content.update({ audio_url: url }, { where: { id: contentId } });
        logger.info("Content audio_url updated", { contentId, url });
        realtimeService.broadcastAdmin("tts_completed", {
          contentId,
          voiceId,
          audioUrl: url,
          trigger: "voice_synthesis",
          ts: new Date().toISOString(),
        });
      }

      await job.updateProgress(100);
      // Return the real URL as job result — accessible via GET /api/tts/jobs/:id
      return { url, voiceId, contentId: contentId || undefined };
    },
    { connection: redisConnection, concurrency: 2 },
  );

  worker.on("completed", (job, result: VoiceSynthesisJobResult) =>
    logger.info("Voice synthesis completed", { jobId: job.id, url: result.url }),
  );
  worker.on("failed", (job, err) => {
    logger.error("Voice synthesis failed", { jobId: job?.id, err: err.message, stack: err.stack });
    realtimeService.broadcastAdmin("tts_failed", {
      jobId: job?.id,
      trigger: "voice_synthesis",
      error: err.message,
      ts: new Date().toISOString(),
    });
  });
  worker.on("error", (err) =>
    logger.warn("voice-synthesis worker error (Redis unavailable?)", { err: err.message }),
  );

  return worker;
}

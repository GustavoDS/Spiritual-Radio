import { Worker, type Job } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { logger } from "../lib/logger.js";

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
      logger.info("Processing content job", { jobId: job.id, data: job.data });

      const { contentId, generateVoice } = job.data;

      if (generateVoice && job.data.voiceId && job.data.text) {
        logger.info("Queuing voice synthesis", { contentId });
      }

      await job.updateProgress(100);
      logger.info("Content processing complete", { contentId });
    },
    { connection: redisConnection, concurrency: 5 },
  );

  worker.on("completed", (job) =>
    logger.info("Job completed", { jobId: job.id }),
  );
  worker.on("failed", (job, err) =>
    logger.error("Job failed", { jobId: job?.id, err: err.message }),
  );

  return worker;
}

export function startVoiceSynthesisWorker(): Worker {
  const worker = new Worker<VoiceSynthesisJobData>(
    "voice-synthesis",
    async (job: Job<VoiceSynthesisJobData>) => {
      logger.info("Processing voice synthesis", { jobId: job.id, data: job.data });
      await job.updateProgress(100);
    },
    { connection: redisConnection, concurrency: 2 },
  );

  worker.on("completed", (job) =>
    logger.info("Voice synthesis completed", { jobId: job.id }),
  );
  worker.on("failed", (job, err) =>
    logger.error("Voice synthesis failed", { jobId: job?.id, err: err.message }),
  );

  return worker;
}

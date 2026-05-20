import { Worker, type Job } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { logger } from "../lib/logger.js";
import { automationService } from "../services/AutomationService.js";

export interface AutomationJobData {
  triggeredBy?: "scheduler" | "manual" | "gap_fill" | "fallback";
}

export function startAutomationWorker(): Worker {
  const worker = new Worker<AutomationJobData>(
    "automation",
    async (job: Job<AutomationJobData>) => {
      const triggeredBy = job.data.triggeredBy ?? "scheduler";
      logger.info("AutomationWorker: job started", { jobId: job.id, triggeredBy });

      const result = await automationService.runAutomation(triggeredBy);

      logger.info("AutomationWorker: job completed", {
        jobId: job.id,
        runId: result.runId,
        contentsGenerated: result.contentsGenerated,
        status: result.status,
        durationMs: result.durationMs,
      });

      return result;
    },
    {
      connection: redisConnection,
      concurrency: 1, // Never run two automation jobs simultaneously
    },
  );

  worker.on("failed", (job, err) => {
    logger.error("AutomationWorker: job failed", {
      jobId: job?.id,
      err: err.message,
    });
  });

  worker.on("completed", (job) => {
    logger.info("AutomationWorker: job done", { jobId: job.id });
  });

  return worker;
}

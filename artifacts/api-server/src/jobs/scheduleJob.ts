import { Worker, type Job } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { logger } from "../lib/logger.js";
import { Channel } from "../models/index.js";
import { playlistService } from "../services/PlaylistService.js";
import { realtimeService } from "../services/RealtimeService.js";

export interface ScheduleJobData {
  channelId?: number;
  date?: string;
}

export function startScheduleWorker(): Worker {
  const worker = new Worker<ScheduleJobData>(
    "schedule",
    async (job: Job<ScheduleJobData>) => {
      logger.info("Schedule worker started", { jobId: job.id, data: job.data });

      const channels = job.data.channelId
        ? [{ id: job.data.channelId }]
        : await Channel.findAll({ where: { ativo: true }, attributes: ["id"] });

      const today = new Date().toISOString().split("T")[0]!;
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split("T")[0]!;
      const dates = job.data.date ? [job.data.date] : [today, tomorrow];

      for (const channel of channels) {
        for (const date of dates) {
          try {
            await playlistService.generatePlaylist(channel.id, date);
            logger.info("Schedule worker: playlist generated", { channelId: channel.id, date });
            realtimeService.broadcastAdmin("schedule_executed", {
              trigger: "cron",
              channelId: channel.id,
              date,
              ts: new Date().toISOString(),
            });
          } catch (err) {
            logger.error("Schedule worker: failed to generate playlist", {
              channelId: channel.id,
              date,
              err: err instanceof Error ? err.message : err,
            });
          }
        }
      }

      await job.updateProgress(100);
    },
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on("completed", (job) => logger.info("Schedule job completed", { jobId: job.id }));
  worker.on("failed", (job, err) =>
    logger.error("Schedule job failed", { jobId: job?.id, err: err.message }),
  );
  worker.on("error", (err) =>
    logger.warn("schedule worker error (Redis unavailable?)", { err: err.message }),
  );

  return worker;
}

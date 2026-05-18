import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { logger } from "../lib/logger.js";

export const contentProcessingQueue = new Queue("content-processing", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const voiceSynthesisQueue = new Queue("voice-synthesis", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 50,
  },
});

export const scheduleQueue = new Queue("schedule", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: 200,
    removeOnFail: 100,
  },
});

contentProcessingQueue.on("error", (err) =>
  logger.error("contentProcessingQueue error", { err: err.message }),
);
voiceSynthesisQueue.on("error", (err) =>
  logger.error("voiceSynthesisQueue error", { err: err.message }),
);
scheduleQueue.on("error", (err) =>
  logger.error("scheduleQueue error", { err: err.message }),
);

logger.info("BullMQ queues initialized");

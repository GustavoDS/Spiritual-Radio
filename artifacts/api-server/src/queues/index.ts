import { Queue } from "bullmq";
import { redisQueueConnection } from "../config/redis.js";
import { logger } from "../lib/logger.js";

export const contentProcessingQueue = new Queue("content-processing", {
  connection: redisQueueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const voiceSynthesisQueue = new Queue("voice-synthesis", {
  connection: redisQueueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 50,
  },
});

export const scheduleQueue = new Queue("schedule", {
  connection: redisQueueConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 200,
    removeOnFail: 100,
  },
});

export const cleanupQueue = new Queue("cleanup", {
  connection: redisQueueConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 10,
    removeOnFail: 10,
  },
});

contentProcessingQueue.on("error", (err) =>
  logger.warn("contentProcessingQueue error", { err: err.message }),
);
voiceSynthesisQueue.on("error", (err) =>
  logger.warn("voiceSynthesisQueue error", { err: err.message }),
);
scheduleQueue.on("error", (err) =>
  logger.warn("scheduleQueue error", { err: err.message }),
);
cleanupQueue.on("error", (err) =>
  logger.warn("cleanupQueue error", { err: err.message }),
);

logger.info("BullMQ queues initialized");

import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "../lib/logger.js";

/**
 * Singleton Redis client used for token blacklist, rate limiter store, etc.
 * lazyConnect=true — does NOT connect until redis.connect() is called in bootstrap.
 */
export const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 500, 2000);
  },
});

redis.on("connect", () => logger.info("Redis connected"));
redis.on("error", (err) => logger.error("Redis error", { err: err.message }));

const parsed = new URL(env.redisUrl);

/**
 * Connection config used by BullMQ Workers (long-lived, reconnect-friendly).
 * Workers need persistent connections — 3 retries before giving up.
 */
export const redisConnection = {
  host: parsed.hostname,
  port: Number(parsed.port) || 6379,
  password: parsed.password || undefined,
  retryStrategy: (times: number) => {
    if (times > 3) return null;
    return Math.min(times * 500, 2000);
  },
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

/**
 * Connection config used by BullMQ Queue instances (short-lived commands).
 * Queues should fail fast when Redis is unavailable — no retries after the first attempt.
 * This prevents the ECONNREFUSED log spam when Redis is not running in dev.
 */
export const redisQueueConnection = {
  host: parsed.hostname,
  port: Number(parsed.port) || 6379,
  password: parsed.password || undefined,
  retryStrategy: (_times: number) => null, // fail immediately — Queue commands are opportunistic
  maxRetriesPerRequest: 0,
  enableReadyCheck: false,
};

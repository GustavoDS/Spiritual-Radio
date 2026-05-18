import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "../lib/logger.js";

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

import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

/**
 * Rate limiters use in-memory store.
 *
 * To enable Redis-backed distributed rate limiting (recommended for
 * multi-instance production), ensure Redis is available and uncomment
 * the RedisStore block below. The rate-limit-redis package is already
 * installed and ready to use.
 *
 * Example:
 *   import { RedisStore } from "rate-limit-redis";
 *   import { redis } from "../config/redis.js";
 *   store: new RedisStore({
 *     sendCommand: (...args: string[]) =>
 *       redis.call(args[0]!, ...args.slice(1)) as Promise<number>,
 *     prefix: "rl:global:",
 *   }),
 */

export const globalLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: env.rateLimitMax,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Muitas requisições — tente novamente em alguns instantes" },
  skip: (req) => req.path === "/api/healthz",
});

export const authLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: env.rateLimitAuthMax,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Muitas tentativas de autenticação — aguarde antes de tentar novamente" },
});

export const adminOpsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Muitas operações em curto intervalo — aguarde antes de tentar novamente" },
});

export const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Muitos envios em pouco tempo — tente novamente mais tarde" },
  skip: () => process.env["NODE_ENV"] === "test",
});

import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from "express-rate-limit";
import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/* ─── Key generators ─────────────────────────────────────────────────────── */

/**
 * Normalises the client IP extracted from req.ip (which Express already
 * resolves from X-Forwarded-For when trust proxy is set) and calls
 * ipKeyGenerator() to handle IPv6-mapped IPv4 addresses
 * (e.g. "::ffff:1.2.3.4" → "1.2.3.4"), satisfying the ERR_ERL_KEY_GEN_IPV6
 * validation added in express-rate-limit v8.
 */
function ipKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? "unknown");
}

/**
 * Stream key: normalised IP + session token when available.
 *
 * Players behind a shared NAT/corporate proxy/Cloudflare share the same IP.
 * Including the X-AutoDJ-Session token gives each physical player its own
 * rate-limit bucket so a classroom of 50 students doesn't push each other into
 * 429s.  Falls back to plain IP for anonymous/first requests (before the
 * frontend captures the token from the manifest response header).
 */
function streamKey(req: Request): string {
  const ip = ipKeyGenerator(req.ip ?? "unknown");
  const token =
    (req.headers["x-autodj-session"] as string | undefined) ??
    (req.query["token"] as string | undefined);
  return token ? `${ip}:${token.slice(0, 36)}` : ip;
}

/* ─── Handler factory ────────────────────────────────────────────────────── */

/**
 * Builds a 429 handler that:
 *  - always sets `Retry-After` (the frontend reads and honours it)
 *  - logs a structured warning with bucket name, IP and session token so we
 *    can calibrate limits without guessing
 */
function make429Handler(bucketName: string, windowMs: number) {
  return (req: Request, res: Response): void => {
    const retryAfterSec = Math.ceil(windowMs / 1000);
    const ip = ipKey(req);
    const token =
      (req.headers["x-autodj-session"] as string | undefined) ??
      (req.query["token"] as string | undefined) ??
      null;

    logger.warn("rate-limit: 429 triggered", {
      bucket: bucketName,
      ip,
      sessionToken: token ? token.slice(0, 8) + "…" : null,
      path: req.path,
      retryAfterSec,
    });

    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({
      success: false,
      message: "Muitas requisições — tente novamente em alguns instantes",
      retryAfterSec,
    });
  };
}

/* ─── Helper ─────────────────────────────────────────────────────────────── */

function makeStreamLimiter(
  windowMs: number,
  limit: number,
  bucketName: string,
  keyGen: (req: Request) => string = streamKey,
): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: keyGen,
    handler: make429Handler(bucketName, windowMs),
  });
}

/* ─── Exported limiters ──────────────────────────────────────────────────── */

/**
 * Global catch-all limiter — applied in app.ts to every route that doesn't
 * have its own dedicated limiter.  Stream routes are excluded via `skip` so
 * they use their per-category buckets below.
 *
 * Default: 200 req / 60 s / IP  (raised from 100 — stream routes are now
 * handled separately, so the global bucket is only hit by admin/API calls).
 */
export const globalLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: Math.max(env.rateLimitMax, 200), // floor at 200 even if env is lower
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: ipKey,
  handler: make429Handler("global", env.rateLimitWindowMs),
  // Skip healthcheck and all stream-related public routes — they use their own
  // per-category limiters applied directly in the router.
  skip: (req) =>
    req.path === "/api/healthz" ||
    /^\/api\/public\/(stream\/|live\.m3u8|now-playing\.json|events)/.test(req.path) ||
    req.path.startsWith("/uploads"),
});

/**
 * Bucket A — metadata: /now-playing.json, /ping, /events (SSE)
 *
 * Expected per listener: ~4 req/min (now-playing) + ~2 req/min (ping) = 6/min.
 * 120 req/min/key allows 20 listeners from the same IP+token before limiting.
 */
export const streamMetadataLimiter = makeStreamLimiter(60_000, 120, "stream/metadata");

/**
 * Bucket B — manifest: /live.m3u8
 *
 * HLS clients reload the manifest approximately every targetDuration seconds.
 * With targetDuration = 10 s that is ~6 req/min per listener; with 2 s it is
 * ~30 req/min.  240 req/min/key comfortably covers 8–40 listeners per key.
 */
export const streamManifestLimiter = makeStreamLimiter(60_000, 240, "stream/manifest");

/**
 * Auth endpoints — keep tight to prevent credential brute-force.
 */
export const authLimiter = makeStreamLimiter(
  env.rateLimitWindowMs,
  env.rateLimitAuthMax,
  "auth",
  ipKey, // auth uses IP only — no session token yet at login time
);

/**
 * Heavy admin operations (regenerate, materialize, etc.).
 */
export const adminOpsLimiter = makeStreamLimiter(60_000, 20, "admin-ops", ipKey);

/**
 * Contact / prayer-request form — strict per-IP, per hour.
 */
export const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: ipKey,
  handler: make429Handler("contact", 60 * 60 * 1000),
  skip: () => process.env["NODE_ENV"] === "test",
});

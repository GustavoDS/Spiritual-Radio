import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

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

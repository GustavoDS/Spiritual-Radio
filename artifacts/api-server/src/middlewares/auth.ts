import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../utils/jwt.js";
import { unauthorized, forbidden } from "../utils/response.js";
import { redis } from "../config/redis.js";
import { logger } from "../lib/logger.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    unauthorized(res, "Token de autenticação não fornecido");
    return;
  }

  const token = authHeader.slice(7);
  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    unauthorized(res, "Token inválido ou expirado");
    return;
  }

  try {
    const blacklisted = await redis.exists(`blacklist:${token}`);
    if (blacklisted) {
      unauthorized(res, "Token revogado — faça login novamente");
      return;
    }
  } catch (err) {
    logger.debug("Redis unavailable during blacklist check — fail open", { err });
  }

  req.user = payload;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      unauthorized(res);
      return;
    }
    if (!roles.includes(req.user.role)) {
      forbidden(res, "Permissão insuficiente");
      return;
    }
    next();
  };
}

export const requireAdmin = requireRole("admin");
export const requireEditor = requireRole("admin", "editor");

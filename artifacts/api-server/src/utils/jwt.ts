import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface JwtPayload {
  id: number;
  email: string;
  role: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: "30d" });
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtRefreshSecret) as JwtPayload;
}

export function decodeTokenExpiry(token: string): number {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  return decoded?.exp ?? 0;
}

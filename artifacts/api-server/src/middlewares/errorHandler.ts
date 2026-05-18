import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class HttpError extends Error implements AppError {
  statusCode: number;
  isOperational = true;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const isOperational = err.isOperational ?? false;

  logger.error("Request error", {
    method: req.method,
    url: req.url,
    statusCode,
    message: err.message,
    stack: statusCode >= 500 ? err.stack : undefined,
  });

  if (res.headersSent) return;

  res.status(statusCode).json({
    success: false,
    message: isOperational ? err.message : "Erro interno do servidor",
    ...(process.env["NODE_ENV"] === "development" && { stack: err.stack }),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Rota ${req.method} ${req.path} não encontrada`,
  });
}

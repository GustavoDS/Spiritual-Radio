import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers["x-request-id"] as string | undefined) || randomUUID();
  req.id = id;
  res.setHeader("x-request-id", id);
  next();
}

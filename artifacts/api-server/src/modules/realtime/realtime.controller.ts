import type { Request, Response } from "express";
import { realtimeService } from "../../services/RealtimeService.js";
import { verifyToken } from "../../utils/jwt.js";
import { logger } from "../../lib/logger.js";

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first?.trim() ?? req.socket.remoteAddress ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

export function sseConnect(req: Request, res: Response): void {
  const ip = getClientIp(req);

  if (!realtimeService.canConnect(ip)) {
    res.status(429).json({
      success: false,
      message: "Limite de conexões SSE atingido — tente novamente mais tarde",
    });
    return;
  }

  // Auth: accept token from query param ?token= (browsers using EventSource can't send headers)
  // or Authorization: Bearer <token> header (curl, programmatic clients)
  let isAdmin = false;
  let userId: number | undefined;

  const tokenParam = typeof req.query["token"] === "string" ? req.query["token"] : undefined;
  const authHeader = req.headers["authorization"];
  const rawToken =
    tokenParam ??
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined);

  if (rawToken) {
    try {
      const payload = verifyToken(rawToken);
      isAdmin = payload.role === "admin" || payload.role === "editor";
      userId = payload.id;
    } catch {
      // Invalid / expired token → degrade to public stream, do not reject
      logger.debug("SSE: invalid token — connecting as public client", { ip });
    }
  }

  // SSE headers — disable all buffering
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // nginx: disable proxy buffering
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const clientId = realtimeService.addClient(res, ip, isAdmin, userId);

  // Send welcome / connected event
  res.write(
    `id: connected\nevent: connected\ndata: ${JSON.stringify({
      clientId,
      isAdmin,
      ts: new Date().toISOString(),
    })}\n\n`,
  );

  // Cleanup when client disconnects
  req.on("close", () => {
    realtimeService.removeClient(clientId);
  });
}

import { Router } from "express";
import { sseConnect } from "./realtime.controller.js";

const router = Router();

/**
 * GET /api/realtime/events
 * Server-Sent Events stream.
 * Auth: optional JWT via ?token= query param or Authorization: Bearer header.
 * Public clients receive public events; admin/editor clients receive all events.
 */
router.get("/events", sseConnect);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import publicRouter from "./public.js";
import authRouter from "../modules/auth/auth.routes.js";
import usersRouter from "../modules/users/users.routes.js";
import channelsRouter from "../modules/channels/channels.routes.js";
import contentsRouter from "../modules/contents/contents.routes.js";
import categoriesRouter from "../modules/categories/categories.routes.js";
import schedulesRouter from "../modules/schedules/schedules.routes.js";
import playlistsRouter from "../modules/playlists/playlists.routes.js";
import voicesRouter from "../modules/voices/voices.routes.js";
import radioRouter from "../modules/radio/radio.routes.js";
import aiRouter from "../modules/ai/ai.routes.js";
import ttsRouter from "../modules/tts/tts.routes.js";
import messagesRouter from "../modules/messages/messages.routes.js";
import adminOpsRouter from "../modules/admin-ops/admin-ops.routes.js";
import realtimeRouter from "../modules/realtime/realtime.routes.js";
import analyticsRouter from "../modules/analytics/analytics.routes.js";
import automationRouter from "../modules/automation/automation.routes.js";
import { streamAdminRouter } from "../modules/stream/stream.routes.js";
import programasRouter from "../modules/programas/programas.routes.js";
import gradeProgramasRouter from "../modules/grade-programas/grade-programas.routes.js";
import debugRouter from "../modules/debug/debug.routes.js";

const router: IRouter = Router();

router.use(healthRouter);

router.use("/public", publicRouter);

router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/channels", channelsRouter);
router.use("/contents", contentsRouter);
router.use("/categories", categoriesRouter);
router.use("/schedule", schedulesRouter);
router.use("/playlists", playlistsRouter);
router.use("/voices", voicesRouter);
router.use("/radio", radioRouter);
router.use("/ai", aiRouter);
router.use("/tts", ttsRouter);
router.use("/admin/messages", messagesRouter);
router.use("/admin", adminOpsRouter);
router.use("/admin/analytics", analyticsRouter);
router.use("/admin/automation", automationRouter);
router.use("/admin/stream", streamAdminRouter);
router.use("/realtime", realtimeRouter);
router.use("/programas", programasRouter);
router.use("/grade-programas", gradeProgramasRouter);
router.use("/debug", debugRouter);

export default router;

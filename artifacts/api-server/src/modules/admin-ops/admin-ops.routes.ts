import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import { validateIntegerId } from "../../middlewares/validateId.js";
import { validate } from "../../middlewares/validate.js";
import { adminOpsLimiter } from "../../middlewares/rateLimiter.js";
// unread-count and priority routes live in messages.routes.ts to avoid /:id collision
import {
  regeneratePlaylist,
  runScheduleNow,
  getRadioStatus,
  getSystemHealth,
  generateContentTts,
  getStorageStatus,
} from "./admin-ops.controller.js";
import {
  runNowSchema,
  generateTtsSchema,
} from "./admin-ops.validators.js";

const router = Router();

router.param("id", validateIntegerId);
router.use(authenticate, requireAdmin);

router.post("/playlists/:id/regenerate", adminOpsLimiter, regeneratePlaylist);
router.post("/schedule/run-now", adminOpsLimiter, validate(runNowSchema), runScheduleNow);

router.get("/radio/status", getRadioStatus);
router.get("/system/health", getSystemHealth);
router.get("/storage/status", getStorageStatus);

router.post("/contents/:id/generate-tts", adminOpsLimiter, validate(generateTtsSchema), generateContentTts);

export default router;

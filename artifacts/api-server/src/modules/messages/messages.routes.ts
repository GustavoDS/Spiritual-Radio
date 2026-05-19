import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import { validateIntegerId } from "../../middlewares/validateId.js";
import { validate } from "../../middlewares/validate.js";
import { getAll, getById, updateStatus, respond, remove, getStats } from "./messages.controller.js";
import { getUnreadCount, updatePriority } from "../admin-ops/admin-ops.controller.js";
import { updatePrioritySchema } from "../admin-ops/admin-ops.validators.js";

const router = Router();

router.param("id", validateIntegerId);
router.use(authenticate, requireAdmin);

router.get("/unread-count", getUnreadCount);
router.get("/stats", getStats);
router.get("/", getAll);
router.get("/:id", getById);
router.patch("/:id/priority", validate(updatePrioritySchema), updatePriority);
router.patch("/:id/status", updateStatus);
router.patch("/:id/respond", respond);
router.delete("/:id", remove);

export default router;

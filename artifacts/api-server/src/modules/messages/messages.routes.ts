import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import { validateIntegerId } from "../../middlewares/validateId.js";
import { getAll, getById, updateStatus, respond, remove, getStats } from "./messages.controller.js";

const router = Router();

router.param("id", validateIntegerId);
router.use(authenticate, requireAdmin);

router.get("/stats", getStats);
router.get("/", getAll);
router.get("/:id", getById);
router.patch("/:id/status", updateStatus);
router.patch("/:id/respond", respond);
router.delete("/:id", remove);

export default router;

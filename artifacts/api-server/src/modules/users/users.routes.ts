import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import { getAll, getById, update, remove } from "./users.controller.js";
import { validateIntegerId } from "../../middlewares/validateId.js";

const router = Router();

router.param("id", validateIntegerId);
router.use(authenticate);
router.get("/", requireAdmin, getAll);
router.get("/:id", getById);
router.put("/:id", update);
router.delete("/:id", requireAdmin, remove);

export default router;

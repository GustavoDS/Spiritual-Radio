import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import { getAll, getById, update, remove } from "./users.controller.js";

const router = Router();

router.use(authenticate);
router.get("/", requireAdmin, getAll);
router.get("/:id", getById);
router.put("/:id", update);
router.delete("/:id", requireAdmin, remove);

export default router;

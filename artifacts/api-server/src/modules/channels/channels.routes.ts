import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import { getAll, getById, create, update, remove } from "./channels.controller.js";

const router = Router();

router.use(authenticate);
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", requireAdmin, create);
router.put("/:id", requireAdmin, update);
router.delete("/:id", requireAdmin, remove);

export default router;

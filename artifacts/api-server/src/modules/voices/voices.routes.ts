import { Router } from "express";
import { authenticate, requireEditor, requireAdmin } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { getAll, getById, create, update, remove } from "./voices.controller.js";
import { createVoiceSchema, updateVoiceSchema } from "../../validation/schemas.js";

const router = Router();

router.use(authenticate);
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", requireEditor, validate(createVoiceSchema), create);
router.put("/:id", requireEditor, validate(updateVoiceSchema), update);
router.delete("/:id", requireAdmin, remove);

export default router;

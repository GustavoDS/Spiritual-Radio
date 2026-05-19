import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import { getAll, getById, create, update, remove } from "./channels.controller.js";
import { validate } from "../../middlewares/validate.js";
import { createChannelSchema, updateChannelSchema } from "../../validation/schemas.js";
import { validateIntegerId } from "../../middlewares/validateId.js";

const router = Router();

router.param("id", validateIntegerId);
router.use(authenticate);
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", requireAdmin, validate(createChannelSchema), create);
router.put("/:id", requireAdmin, validate(updateChannelSchema), update);
router.delete("/:id", requireAdmin, remove);

export default router;

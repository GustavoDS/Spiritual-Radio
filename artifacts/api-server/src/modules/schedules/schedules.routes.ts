import { Router } from "express";
import { authenticate, requireEditor } from "../../middlewares/auth.js";
import { getAll, create, remove } from "./schedules.controller.js";
import { validate } from "../../middlewares/validate.js";
import { createScheduleSchema } from "../../validation/schemas.js";
import { validateIntegerId } from "../../middlewares/validateId.js";

const router = Router();

router.param("id", validateIntegerId);
router.use(authenticate);
router.get("/", getAll);
router.post("/", requireEditor, validate(createScheduleSchema), create);
router.delete("/:id", requireEditor, remove);

export default router;

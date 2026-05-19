import { Router } from "express";
import { authenticate, requireEditor } from "../../middlewares/auth.js";
import { getAll, create } from "./schedules.controller.js";
import { validate } from "../../middlewares/validate.js";
import { createScheduleSchema } from "../../validation/schemas.js";

const router = Router();

router.use(authenticate);
router.get("/", getAll);
router.post("/", requireEditor, validate(createScheduleSchema), create);

export default router;

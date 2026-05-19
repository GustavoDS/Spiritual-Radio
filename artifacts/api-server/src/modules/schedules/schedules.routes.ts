import { Router } from "express";
import { authenticate, requireEditor } from "../../middlewares/auth.js";
import { getAll, create, remove } from "./schedules.controller.js";
import { validate } from "../../middlewares/validate.js";
import { createScheduleSchema } from "../../validation/schemas.js";

const router = Router();

router.use(authenticate);
router.get("/", getAll);
router.post("/", requireEditor, validate(createScheduleSchema), create);
router.delete("/:id", requireEditor, remove);

export default router;

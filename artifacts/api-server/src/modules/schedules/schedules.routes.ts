import { Router } from "express";
import { authenticate, requireEditor } from "../../middlewares/auth.js";
import { getAll, create } from "./schedules.controller.js";

const router = Router();

router.use(authenticate);
router.get("/", getAll);
router.post("/", requireEditor, create);

export default router;

import { Router } from "express";
import { authenticate } from "../../middlewares/auth.js";
import { getAll, getById } from "./voices.controller.js";

const router = Router();

router.use(authenticate);
router.get("/", getAll);
router.get("/:id", getById);

export default router;

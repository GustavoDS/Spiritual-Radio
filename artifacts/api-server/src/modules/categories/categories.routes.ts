import { Router } from "express";
import { authenticate, requireEditor } from "../../middlewares/auth.js";
import { getAll, getById, create, update, remove } from "./categories.controller.js";

const router = Router();

router.use(authenticate);
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", requireEditor, create);
router.put("/:id", requireEditor, update);
router.delete("/:id", requireEditor, remove);

export default router;

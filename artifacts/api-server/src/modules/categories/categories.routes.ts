import { Router } from "express";
import { authenticate, requireEditor } from "../../middlewares/auth.js";
import { getAll, getById, create, update, remove } from "./categories.controller.js";
import { validate } from "../../middlewares/validate.js";
import { createCategorySchema, updateCategorySchema } from "../../validation/schemas.js";
import { validateIntegerId } from "../../middlewares/validateId.js";

const router = Router();

router.param("id", validateIntegerId);
router.use(authenticate);
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", requireEditor, validate(createCategorySchema), create);
router.put("/:id", requireEditor, validate(updateCategorySchema), update);
router.delete("/:id", requireEditor, remove);

export default router;

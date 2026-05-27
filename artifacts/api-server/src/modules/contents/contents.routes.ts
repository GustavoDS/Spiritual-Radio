import { Router } from "express";
import { authenticate, requireEditor } from "../../middlewares/auth.js";
import { uploadContent } from "../../middlewares/upload.js";
import { getAll, getById, create, update, remove, bulkAssignChannels } from "./contents.controller.js";
import { validate } from "../../middlewares/validate.js";
import { createContentSchema, updateContentSchema } from "../../validation/schemas.js";
import { validateIntegerId } from "../../middlewares/validateId.js";

const router = Router();

router.param("id", validateIntegerId);
router.use(authenticate);
router.get("/", getAll);
router.post("/bulk-assign-channels", requireEditor, bulkAssignChannels);
router.get("/:id", getById);
router.post(
  "/",
  requireEditor,
  uploadContent.fields([{ name: "audio", maxCount: 1 }, { name: "imagem", maxCount: 1 }]),
  validate(createContentSchema),
  create,
);
router.put(
  "/:id",
  requireEditor,
  uploadContent.fields([{ name: "audio", maxCount: 1 }, { name: "imagem", maxCount: 1 }]),
  validate(updateContentSchema),
  update,
);
router.delete("/:id", requireEditor, remove);

export default router;

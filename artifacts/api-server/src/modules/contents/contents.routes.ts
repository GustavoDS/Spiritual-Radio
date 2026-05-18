import { Router } from "express";
import { authenticate, requireEditor } from "../../middlewares/auth.js";
import { uploadContent } from "../../middlewares/upload.js";
import { getAll, getById, create, update, remove } from "./contents.controller.js";

const router = Router();

router.use(authenticate);
router.get("/", getAll);
router.get("/:id", getById);
router.post(
  "/",
  requireEditor,
  uploadContent.fields([{ name: "audio", maxCount: 1 }, { name: "imagem", maxCount: 1 }]),
  create,
);
router.put(
  "/:id",
  requireEditor,
  uploadContent.fields([{ name: "audio", maxCount: 1 }, { name: "imagem", maxCount: 1 }]),
  update,
);
router.delete("/:id", requireEditor, remove);

export default router;

import { Router } from "express";
import { authenticate, requireEditor } from "../../middlewares/auth.js";
import { getAll, getById, create, update, remove } from "./playlists.controller.js";
import { validate } from "../../middlewares/validate.js";
import { createPlaylistSchema, updatePlaylistSchema } from "../../validation/schemas.js";

const router = Router();

router.use(authenticate);
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", requireEditor, validate(createPlaylistSchema), create);
router.put("/:id", requireEditor, validate(updatePlaylistSchema), update);
router.delete("/:id", requireEditor, remove);

export default router;

import { Router } from "express";
import { authenticate, requireEditor } from "../../middlewares/auth.js";
import { getAll, getById, create } from "./playlists.controller.js";
import { validate } from "../../middlewares/validate.js";
import { createPlaylistSchema } from "../../validation/schemas.js";

const router = Router();

router.use(authenticate);
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", requireEditor, validate(createPlaylistSchema), create);

export default router;

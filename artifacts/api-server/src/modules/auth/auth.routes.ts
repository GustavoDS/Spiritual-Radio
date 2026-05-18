import { Router } from "express";
import { register, login, recover } from "./auth.controller.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/recover", recover);

export default router;

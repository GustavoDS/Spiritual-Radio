import { Router } from "express";
import { register, login, recover } from "./auth.controller.js";
import { validate } from "../../middlewares/validate.js";
import { authLimiter } from "../../middlewares/rateLimiter.js";
import { registerSchema, loginSchema, recoverSchema } from "../../validation/schemas.js";

const router = Router();

router.post("/register", authLimiter, validate(registerSchema), register);
router.post("/login", authLimiter, validate(loginSchema), login);
router.post("/recover", authLimiter, validate(recoverSchema), recover);

export default router;

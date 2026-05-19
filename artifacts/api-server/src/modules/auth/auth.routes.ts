import { Router } from "express";
import { register, login, recover, refresh, logout } from "./auth.controller.js";
import { validate } from "../../middlewares/validate.js";
import { authLimiter } from "../../middlewares/rateLimiter.js";
import { authenticate } from "../../middlewares/auth.js";
import { registerSchema, loginSchema, recoverSchema, refreshSchema } from "../../validation/schemas.js";

const router = Router();

router.post("/register", authLimiter, validate(registerSchema), register);
router.post("/login", authLimiter, validate(loginSchema), login);
router.post("/recover", authLimiter, validate(recoverSchema), recover);
router.post("/refresh", authLimiter, validate(refreshSchema), refresh);
router.post("/logout", authenticate, logout);

export default router;

import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import { getRadioAnalytics, getAiAnalytics, getMessageAnalytics, getSystemAnalytics } from "./analytics.controller.js";

const router = Router();

router.use(authenticate, requireAdmin);

router.get("/radio", getRadioAnalytics);
router.get("/ai", getAiAnalytics);
router.get("/messages", getMessageAnalytics);
router.get("/system", getSystemAnalytics);

export default router;

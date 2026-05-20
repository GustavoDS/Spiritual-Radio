import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import {
  getStatus,
  getRules,
  updateRules,
  runNow,
  runSync,
  getLogs,
} from "./automation.controller.js";

const router = Router();

router.use(authenticate, requireAdmin);

router.get("/status", getStatus);
router.get("/rules", getRules);
router.put("/rules", updateRules);
router.post("/run-now", runNow);
router.post("/run-sync", runSync);
router.get("/logs", getLogs);

export default router;

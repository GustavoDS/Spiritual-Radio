import { Router } from "express";
import { authenticate } from "../../middlewares/auth.js";
import { getCurrent, getNext, getSchedule } from "./radio.controller.js";

const router = Router();

router.use(authenticate);
router.get("/current", getCurrent);
router.get("/next", getNext);
router.get("/schedule", getSchedule);

export default router;

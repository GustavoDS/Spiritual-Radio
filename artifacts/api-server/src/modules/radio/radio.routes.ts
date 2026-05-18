import { Router } from "express";
import { getCurrent, getNext, getSchedule } from "./radio.controller.js";

const router = Router();

router.get("/current", getCurrent);
router.get("/next", getNext);
router.get("/schedule", getSchedule);

export default router;

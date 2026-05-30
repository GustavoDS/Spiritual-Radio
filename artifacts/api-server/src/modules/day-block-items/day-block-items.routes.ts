import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import { getItems, bulkUpdate, clearDay } from "./day-block-items.controller.js";

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Day Block Items
 *   description: Materialização persistente de blocos de programação por dia
 */

router.get("/", getItems);
router.put("/bulk", requireAdmin, bulkUpdate);
router.delete("/", requireAdmin, clearDay);

export default router;

import { Router } from "express";
import { authenticate, requireEditor } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { synthesize } from "./tts.controller.js";
import { synthesizeTtsSchema } from "../../validation/schemas.js";

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/tts/synthesize:
 *   post:
 *     tags: [TTS]
 *     summary: Sintetizar áudio via TTS
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [voiceId, text]
 *             properties:
 *               voiceId:
 *                 type: integer
 *                 example: 1
 *               text:
 *                 type: string
 *                 example: "Que a paz de Deus guarde o seu coração."
 *     responses:
 *       200:
 *         description: Resultado da síntese
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                 queued:
 *                   type: boolean
 *                 cached:
 *                   type: boolean
 *                 jobId:
 *                   type: string
 */
router.post("/synthesize", requireEditor, validate(synthesizeTtsSchema), synthesize);

export default router;

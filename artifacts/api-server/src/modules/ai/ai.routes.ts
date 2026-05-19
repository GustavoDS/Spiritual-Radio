import { Router } from "express";
import { authenticate, requireEditor } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { generate, generateScript, summarize } from "./ai.controller.js";
import { generateAiSchema, generateScriptSchema } from "../../validation/schemas.js";
import { z } from "zod";

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/ai/generate:
 *   post:
 *     tags: [IA]
 *     summary: Gerar conteúdo de rádio com IA
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tema, tipo]
 *             properties:
 *               tema:
 *                 type: string
 *                 example: "A paz que transcende o entendimento"
 *               tipo:
 *                 type: string
 *                 example: "devocional"
 *               duracao:
 *                 type: integer
 *                 example: 120
 *               estilo:
 *                 type: string
 *                 example: "reflexivo e encorajador"
 *     responses:
 *       200:
 *         description: Conteúdo gerado
 */
router.post("/generate", requireEditor, validate(generateAiSchema), generate);

/**
 * @openapi
 * /api/ai/script:
 *   post:
 *     tags: [IA]
 *     summary: Gerar roteiro de programa de rádio
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tema]
 *             properties:
 *               tema:
 *                 type: string
 *               duracao:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Roteiro gerado
 */
router.post("/script", requireEditor, validate(generateScriptSchema), generateScript);

/**
 * @openapi
 * /api/ai/summarize:
 *   post:
 *     tags: [IA]
 *     summary: Resumir conteúdo com IA
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Resumo gerado
 */
router.post(
  "/summarize",
  requireEditor,
  validate(z.object({ text: z.string().min(1).max(50_000) })),
  summarize,
);

export default router;

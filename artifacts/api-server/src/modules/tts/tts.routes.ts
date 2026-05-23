import { Router } from "express";
import { authenticate, requireEditor } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { synthesize, mix } from "./tts.controller.js";
import { synthesizeTtsSchema } from "../../validation/schemas.js";

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /api/tts/synthesize:
 *   post:
 *     tags: [TTS]
 *     summary: Sintetizar áudio via TTS (voz seca, sem trilha)
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

/**
 * @openapi
 * /api/tts/mix:
 *   post:
 *     tags: [TTS]
 *     summary: Mixar narração TTS com trilha de fundo (ducking + loudnorm)
 *     description: |
 *       Gera um MP3 pronto para rádio com narração TTS mixada sobre uma trilha de fundo.
 *       O resultado é cacheado por hash dos parâmetros — chamadas idênticas retornam `cached: true`.
 *
 *       **Pipeline interno:**
 *       1. Sintetiza voz via TTS (mesmo provider configurado)
 *       2. Baixa `bedUrl` (máx 20MB, timeout 15s)
 *       3. Mixa com ffmpeg: fade-in/out + sidechaincompress (ducking) + loudnorm
 *       4. Faz upload do MP3 final para o storage
 *       5. Retorna URL pública + duração real
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [voiceId, text, bedUrl]
 *             properties:
 *               voiceId:
 *                 type: integer
 *                 description: ID da voz cadastrada em /voices
 *                 example: 1
 *               text:
 *                 type: string
 *                 maxLength: 5000
 *                 description: Texto a ser narrado
 *                 example: "Que a paz de Deus guarde o seu coração hoje e sempre."
 *               bedUrl:
 *                 type: string
 *                 format: uri
 *                 description: URL pública do MP3 da trilha de fundo
 *                 example: "https://cdn.exemplo.com/trilha-suave-01.mp3"
 *               duckDb:
 *                 type: number
 *                 default: -12
 *                 description: Redução em dB da trilha durante a narração (sidechaincompress)
 *               fadeInMs:
 *                 type: integer
 *                 default: 800
 *                 description: Fade-in da trilha no início (ms)
 *               fadeOutMs:
 *                 type: integer
 *                 default: 1500
 *                 description: Fade-out da trilha no fim (ms)
 *               tailMs:
 *                 type: integer
 *                 default: 2000
 *                 description: Tempo extra da trilha após fim da voz (ms)
 *               bedGainDb:
 *                 type: number
 *                 default: -6
 *                 description: Volume base da trilha antes do ducking (dB)
 *               voiceGainDb:
 *                 type: number
 *                 default: 0
 *                 description: Ganho da narração (dB)
 *               normalizeLufs:
 *                 type: number
 *                 default: -16
 *                 description: Loudness alvo (LUFS) — padrão broadcast
 *     responses:
 *       200:
 *         description: Mix concluído ou recuperado do cache
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                       description: URL pública do MP3 mixado
 *                     duration_sec:
 *                       type: integer
 *                       description: Duração real do arquivo final (segundos)
 *                     cached:
 *                       type: boolean
 *                       description: true se o resultado foi recuperado do cache
 *                     voiceUrl:
 *                       type: string
 *                       description: URL da narração TTS sem trilha
 *                     bedUrl:
 *                       type: string
 *                       description: URL da trilha de fundo usada
 *       400:
 *         description: text vazio, voiceId inexistente, ou bedUrl inválida
 *       413:
 *         description: Texto excede 5000 caracteres
 *       502:
 *         description: Falha ao baixar bedUrl (inacessível ou timeout)
 *       500:
 *         description: Falha no ffmpeg
 */
router.post("/mix", requireEditor, mix);

export default router;

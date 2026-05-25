import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import {
  listTracks,
  getTrack,
  createTrack,
  updateTrack,
  deleteTrack,
  generateTrack,
  listSettings,
  getSettings,
  upsertSettings,
  remixContent,
} from "./background-tracks.controller.js";

const router = Router();
router.use(authenticate, requireAdmin);

/**
 * @openapi
 * tags:
 *   - name: BackgroundTracks
 *     description: Biblioteca de trilhas instrumentais para mixagem com conteúdo falado
 */

// ── Specific static paths MUST come before /:id to avoid route shadowing ──

/**
 * @openapi
 * /api/admin/background-tracks:
 *   get:
 *     tags: [BackgroundTracks]
 *     summary: Listar trilhas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [oracao, reflexao, mensagem, generico] }
 *       - in: query
 *         name: source
 *         schema: { type: string, enum: [manual, elevenlabs] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *   post:
 *     tags: [BackgroundTracks]
 *     summary: Criar trilha (URL manual)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, url]
 *             properties:
 *               name: { type: string }
 *               url: { type: string, format: uri }
 *               category: { type: string, enum: [oracao, reflexao, mensagem, generico] }
 *               duration_seconds: { type: number }
 *               tags: { type: array, items: { type: string } }
 */
router.get("/", listTracks);
router.post("/", createTrack);

/**
 * @openapi
 * /api/admin/background-tracks/generate:
 *   post:
 *     tags: [BackgroundTracks]
 *     summary: Gerar trilha via ElevenLabs Music (IA)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prompt]
 *             properties:
 *               prompt:
 *                 type: string
 *                 example: "Instrumental cristão suave, piano e violino, para oração"
 *               duration_seconds: { type: integer, default: 60, minimum: 10, maximum: 300 }
 *               category: { type: string, enum: [oracao, reflexao, mensagem, generico] }
 *               name: { type: string }
 *     responses:
 *       201: { description: Trilha gerada e salva no storage }
 *       503: { description: ELEVENLABS_API_KEY não configurado }
 */
router.post("/generate", generateTrack);

/**
 * @openapi
 * /api/admin/background-tracks/remix/{contentId}:
 *   post:
 *     tags: [BackgroundTracks]
 *     summary: Forçar re-mixagem de um conteúdo (on-demand)
 *     description: Executa a mixagem agora e salva `mixed_audio_url` no conteúdo.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contentId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Mix concluído }
 *       422: { description: Sem trilha disponível ou mixagem desabilitada }
 */
router.post("/remix/:contentId", remixContent);

/**
 * @openapi
 * /api/admin/background-tracks/settings:
 *   get:
 *     tags: [BackgroundTracks]
 *     summary: Listar todas as configurações de tipo
 *     security:
 *       - bearerAuth: []
 */
router.get("/settings", listSettings);

/**
 * @openapi
 * /api/admin/background-tracks/settings/{contentType}:
 *   get:
 *     tags: [BackgroundTracks]
 *     summary: Obter configuração de um tipo de conteúdo
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contentType
 *         required: true
 *         schema: { type: string, enum: [oracao, reflexao, mensagem] }
 *   patch:
 *     tags: [BackgroundTracks]
 *     summary: Atualizar configuração (invalida cache de mix do tipo)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled: { type: boolean }
 *               volume_base: { type: number, minimum: 0, maximum: 1 }
 *               ducking_db: { type: integer, enum: [-12, -18, -24] }
 *               fade_in_ms: { type: integer }
 *               fade_out_ms: { type: integer }
 *               default_category: { type: string }
 */
router.get("/settings/:contentType", getSettings);
router.patch("/settings/:contentType", upsertSettings);

/**
 * @openapi
 * /api/admin/background-tracks/{id}:
 *   get:
 *     tags: [BackgroundTracks]
 *     summary: Buscar trilha por ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *   patch:
 *     tags: [BackgroundTracks]
 *     summary: Atualizar trilha
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     tags: [BackgroundTracks]
 *     summary: Remover trilha (invalida cache de mix)
 *     security:
 *       - bearerAuth: []
 */
router.get("/:id", getTrack);
router.patch("/:id", updateTrack);
router.delete("/:id", deleteTrack);

export default router;

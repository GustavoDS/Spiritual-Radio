import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import {
  getAll, getById, create, update, remove,
  gerarAudio, seed, getSfxStatus, sfxSeed, regenerarTodas,
} from "./vinhetas.controller.js";

/**
 * @swagger
 * tags:
 *   name: Vinhetas
 *   description: Gerenciamento de vinhetas dinâmicas — TTS + SFX + bed musical por bloco horário
 */

const router = Router();
router.use(authenticate);

// ── Collection ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vinhetas:
 *   get:
 *     tags: [Vinhetas]
 *     summary: Listar vinhetas
 *     parameters:
 *       - { in: query, name: channel_id, schema: { type: integer } }
 *       - { in: query, name: bloco, schema: { type: string, enum: [madrugada,amanhecer,manha,almoco,tarde,prime,noite,devocional,sleep] } }
 *       - { in: query, name: tipo_vinheta, schema: { type: string, enum: [abertura,transicao,encerramento,antes_de_oracao,antes_de_mensagem,antes_de_versiculo] } }
 *       - { in: query, name: ativo, schema: { type: boolean } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limit, schema: { type: integer } }
 */
router.get("/", getAll);

/**
 * @swagger
 * /api/vinhetas:
 *   post:
 *     tags: [Vinhetas]
 *     summary: Criar vinheta
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, texto, bloco, tipo_vinheta]
 *             properties:
 *               channel_id:        { type: integer, nullable: true }
 *               nome:              { type: string }
 *               texto:             { type: string }
 *               bloco:             { type: string }
 *               tipo_vinheta:      { type: string }
 *               voice_id:          { type: string, nullable: true }
 *               background_track_id: { type: string, nullable: true, description: "UUID do BackgroundTrack para bed musical" }
 *               sfx_intro_url:     { type: string, nullable: true }
 *               sfx_outro_url:     { type: string, nullable: true }
 *               bed_volume_db:     { type: integer, default: -20 }
 *               ducking_enabled:   { type: boolean, default: true }
 *               ativo:             { type: boolean }
 *               prioridade:        { type: integer }
 */
router.post("/", requireAdmin, create);

// ── Special actions — must come before /:id to avoid route conflicts ─────────

/**
 * @swagger
 * /api/vinhetas/seed:
 *   post:
 *     tags: [Vinhetas]
 *     summary: Criar 54 vinhetas padrão (9 blocos × 6 tipos). Associa bed + SFX se já existirem.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               channel_id: { type: integer, description: "Se omitido, cria vinhetas globais" }
 */
router.post("/seed", requireAdmin, seed);

/**
 * @swagger
 * /api/vinhetas/sfx:
 *   get:
 *     tags: [Vinhetas]
 *     summary: Status dos 6 SFX stingers (um por tipo_vinheta)
 *     description: >
 *       Sempre retorna 6 itens na ordem canônica do enum. audio_url=null indica que
 *       o stinger ainda não foi gerado (rodar POST /sfx/seed para criar).
 *       reused_count = quantas vinhetas usam esse SFX como sfx_intro_url ou sfx_outro_url.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           tipo_vinheta:  { type: string }
 *                           audio_url:     { type: string, nullable: true }
 *                           duracao_sec:   { type: number, nullable: true }
 *                           prompt:        { type: string, nullable: true }
 *                           created_at:    { type: string, nullable: true }
 *                           reused_count:  { type: integer }
 */
router.get("/sfx", requireAdmin, getSfxStatus);

/**
 * @swagger
 * /api/vinhetas/sfx/seed:
 *   post:
 *     tags: [Vinhetas]
 *     summary: Gerar (ou reutilizar) os 6 stingers SFX padrão via ElevenLabs Sound Effects API
 *     description: >
 *       Cria um stinger SFX para cada tipo_vinheta (abertura, encerramento, transicao,
 *       antes_de_oracao, antes_de_mensagem, antes_de_versiculo) e salva no storage.
 *       Chamadas subsequentes reutilizam o SFX já gerado (cache determinístico por tipo).
 *       Use force=true para forçar regeneração mesmo que o arquivo já exista.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               force: { type: boolean, default: false, description: "Forçar regeneração mesmo se já existir" }
 *     responses:
 *       200:
 *         description: Lista de SFX gerados/reutilizados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           tipo:      { type: string }
 *                           intro_url: { type: string, nullable: true }
 *                           outro_url: { type: string, nullable: true }
 *                     created: { type: integer }
 *                     skipped: { type: integer }
 */
router.post("/sfx/seed", requireAdmin, sfxSeed);

/**
 * @swagger
 * /api/vinhetas/regenerar-todas:
 *   post:
 *     tags: [Vinhetas]
 *     summary: Reprocessar todas as vinhetas ativas em background (max 3 paralelas)
 *     description: >
 *       Inicia o reprocessamento assíncrono de todas as vinhetas ativas.
 *       Retorna imediatamente com o total enfileirado.
 *       Use only_missing_audio=true para regenerar apenas as que ainda não têm áudio.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               only_missing_audio:
 *                 type: boolean
 *                 default: false
 *                 description: "true = regenerar apenas vinhetas sem audio_url"
 *     responses:
 *       200:
 *         description: Quantidade de vinhetas enfileiradas para reprocessamento
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     queued: { type: integer }
 */
router.post("/regenerar-todas", requireAdmin, regenerarTodas);

// ── Item ─────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/vinhetas/{id}:
 *   get:
 *     tags: [Vinhetas]
 *     summary: Buscar vinheta por ID
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 */
router.get("/:id", getById);

/**
 * @swagger
 * /api/vinhetas/{id}:
 *   put:
 *     tags: [Vinhetas]
 *     summary: Atualizar vinheta
 *     security: [{ bearerAuth: [] }]
 */
router.put("/:id", requireAdmin, update);

/**
 * @swagger
 * /api/vinhetas/{id}:
 *   delete:
 *     tags: [Vinhetas]
 *     summary: Remover vinheta
 *     security: [{ bearerAuth: [] }]
 */
router.delete("/:id", requireAdmin, remove);

/**
 * @swagger
 * /api/vinhetas/{id}/gerar-audio:
 *   post:
 *     tags: [Vinhetas]
 *     summary: >
 *       Gerar áudio completo: TTS + SFX stinger + bed musical + loudnorm -16 LUFS.
 *       Salva resultado no storage e atualiza audio_url + duracao_sec.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 */
router.post("/:id/gerar-audio", requireAdmin, gerarAudio);

export default router;

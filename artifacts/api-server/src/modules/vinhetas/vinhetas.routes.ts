import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import { getAll, getById, create, update, remove, gerarAudio, seed } from "./vinhetas.controller.js";

/**
 * @swagger
 * tags:
 *   name: Vinhetas
 *   description: Gerenciamento de vinhetas dinâmicas por bloco horário
 */

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * /api/vinhetas:
 *   get:
 *     tags: [Vinhetas]
 *     summary: Listar vinhetas
 *     parameters:
 *       - in: query
 *         name: channel_id
 *         schema: { type: integer }
 *       - in: query
 *         name: bloco
 *         schema: { type: string, enum: [madrugada,amanhecer,manha,almoco,tarde,prime,noite,devocional,sleep] }
 *       - in: query
 *         name: tipo_vinheta
 *         schema: { type: string, enum: [abertura,transicao,encerramento,antes_de_oracao,antes_de_mensagem,antes_de_versiculo] }
 *       - in: query
 *         name: ativo
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Lista de vinhetas
 */
router.get("/", getAll);

/**
 * @swagger
 * /api/vinhetas/seed:
 *   post:
 *     tags: [Vinhetas]
 *     summary: Criar vinhetas padrão para todos os blocos (~54 vinhetas)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               channel_id:
 *                 type: integer
 *                 description: "Se omitido, cria vinhetas globais (channel_id = null)"
 *     responses:
 *       200:
 *         description: Resultado do seed
 */
router.post("/seed", requireAdmin, seed);

/**
 * @swagger
 * /api/vinhetas/{id}:
 *   get:
 *     tags: [Vinhetas]
 *     summary: Buscar vinheta por ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Vinheta encontrada
 *       404:
 *         description: Não encontrada
 */
router.get("/:id", getById);

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
 *               channel_id:   { type: integer, nullable: true }
 *               nome:         { type: string }
 *               texto:        { type: string }
 *               bloco:        { type: string, enum: [madrugada,amanhecer,manha,almoco,tarde,prime,noite,devocional,sleep] }
 *               tipo_vinheta: { type: string, enum: [abertura,transicao,encerramento,antes_de_oracao,antes_de_mensagem,antes_de_versiculo] }
 *               voice_id:     { type: string, nullable: true }
 *               ativo:        { type: boolean }
 *               prioridade:   { type: integer }
 */
router.post("/", requireAdmin, create);

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
 *     summary: Gerar áudio TTS para a vinheta
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Vinheta com audio_url preenchido
 */
router.post("/:id/gerar-audio", requireAdmin, gerarAudio);

export default router;

import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import { validateIntegerId } from "../../middlewares/validateId.js";
import {
  getAll,
  getById,
  createPrograma,
  updatePrograma,
  deletePrograma,
  duplicatePrograma,
  resolvePrograma,
  seedProgramas,
} from "./programas.controller.js";

const router = Router();

router.use(authenticate);
router.param("id", validateIntegerId);

/**
 * @swagger
 * tags:
 *   name: Programas
 *   description: Programas de rádio reutilizáveis com receita de conteúdo
 */

/**
 * @swagger
 * /programas:
 *   get:
 *     summary: Lista programas
 *     tags: [Programas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: channel_id
 *         schema: { type: integer }
 *       - in: query
 *         name: bloco
 *         schema: { type: string }
 *       - in: query
 *         name: ativo
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Lista paginada de programas
 */
router.get("/", getAll);

/**
 * @swagger
 * /programas/{id}:
 *   get:
 *     summary: Busca programa por ID
 *     tags: [Programas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Programa encontrado
 *       404:
 *         description: Programa não encontrado
 */
router.get("/:id", getById);

/**
 * @swagger
 * /programas:
 *   post:
 *     summary: Cria novo programa
 *     tags: [Programas]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nome, duracao_min, bloco, receita]
 *             properties:
 *               nome: { type: string }
 *               descricao: { type: string }
 *               duracao_min: { type: integer, minimum: 5, maximum: 240 }
 *               bloco:
 *                 type: string
 *                 enum: [madrugada, amanhecer, manha, almoco, tarde, prime, noite, devocional, sleep, custom]
 *               receita:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     tipo: { type: string }
 *                     pct: { type: number }
 *               regras:
 *                 type: object
 *                 properties:
 *                   abre_com: { type: string }
 *                   fecha_com: { type: string }
 *                   anti_repeticao_dias: { type: integer }
 *                   max_musicas_seguidas: { type: integer }
 *               channel_id: { type: integer }
 *               ativo: { type: boolean }
 *     responses:
 *       201:
 *         description: Programa criado
 */
router.post("/", requireAdmin, createPrograma);

/**
 * @swagger
 * /programas/{id}:
 *   put:
 *     summary: Atualiza programa
 *     tags: [Programas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Programa atualizado
 */
router.put("/:id", requireAdmin, updatePrograma);

/**
 * @swagger
 * /programas/{id}:
 *   delete:
 *     summary: Desativa programa (soft delete)
 *     tags: [Programas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Programa desativado
 */
router.delete("/:id", requireAdmin, deletePrograma);

/**
 * @swagger
 * /programas/{id}/duplicate:
 *   post:
 *     summary: Duplica um programa
 *     tags: [Programas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Campos a sobrescrever na cópia (todos opcionais)
 *     responses:
 *       201:
 *         description: Cópia criada
 */
router.post("/:id/duplicate", requireAdmin, duplicatePrograma);

/**
 * @swagger
 * /programas/{id}/resolve:
 *   post:
 *     summary: Resolve playlist de um programa para uma data e canal
 *     tags: [Programas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [channel_id, date]
 *             properties:
 *               channel_id: { type: integer }
 *               date: { type: string, format: date, example: "2026-05-23" }
 *               starts_at: { type: string, format: date-time }
 *               seed: { type: string }
 *     responses:
 *       200:
 *         description: Playlist resolvida com itens ordenados
 */
router.post("/:id/resolve", resolvePrograma);

/**
 * @swagger
 * /programas/seed:
 *   post:
 *     summary: Cria os 7 programas-padrão da rádio espiritual
 *     tags: [Programas]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               channel_id: { type: integer }
 *     responses:
 *       200:
 *         description: Programas criados (pula os já existentes)
 */
router.post("/seed", requireAdmin, seedProgramas);

export default router;

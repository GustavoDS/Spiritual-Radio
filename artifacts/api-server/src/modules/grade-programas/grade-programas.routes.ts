import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import { validateIntegerId } from "../../middlewares/validateId.js";
import {
  getAll,
  getById,
  createGrade,
  updateGrade,
  removeGrade,
  bulkCreate,
  resolveDay,
} from "./grade-programas.controller.js";

const router = Router();

router.use(authenticate);
router.param("id", validateIntegerId);

/**
 * @swagger
 * tags:
 *   name: Grade de Programas
 *   description: Grade semanal e exceções de programas por canal
 */

/**
 * @swagger
 * /grade-programas:
 *   get:
 *     summary: Lista grade de programas
 *     tags: [Grade de Programas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: channel_id
 *         schema: { type: integer }
 *       - in: query
 *         name: dia
 *         schema: { type: integer, minimum: 0, maximum: 6 }
 *         description: Dia da semana (0=Dom…6=Sáb) para filtrar recorrentes
 *       - in: query
 *         name: data
 *         schema: { type: string, format: date }
 *         description: YYYY-MM-DD — retorna exceções + recorrentes efetivos nessa data
 *       - in: query
 *         name: ativo
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Lista paginada
 */
router.get("/", getAll);

/**
 * @swagger
 * /grade-programas/resolve-day:
 *   post:
 *     summary: Resolve toda a programação de um canal em uma data
 *     tags: [Grade de Programas]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [channel_id, date]
 *             properties:
 *               channel_id: { type: integer }
 *               date: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Todos os itens do dia em ordem cronológica
 */
router.post("/resolve-day", resolveDay);

/**
 * @swagger
 * /grade-programas/bulk:
 *   post:
 *     summary: Cria múltiplas entradas de grade em uma transação
 *     tags: [Grade de Programas]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/CreateGradePrograma'
 *     responses:
 *       201:
 *         description: Grades criadas
 */
router.post("/bulk", requireAdmin, bulkCreate);

/**
 * @swagger
 * /grade-programas/{id}:
 *   get:
 *     summary: Busca entrada de grade por ID
 *     tags: [Grade de Programas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Entrada encontrada
 *       404:
 *         description: Não encontrada
 */
router.get("/:id", getById);

/**
 * @swagger
 * /grade-programas:
 *   post:
 *     summary: Cria entrada de grade
 *     tags: [Grade de Programas]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [programa_id, channel_id, horario_inicio]
 *             properties:
 *               programa_id: { type: integer }
 *               channel_id: { type: integer }
 *               horario_inicio: { type: string, example: "08:00" }
 *               dias_semana:
 *                 type: array
 *                 items: { type: integer, minimum: 0, maximum: 6 }
 *                 description: Ignorado quando 'data' está preenchido
 *               data:
 *                 type: string
 *                 format: date
 *                 description: Exceção de data específica
 *               prioridade: { type: integer, default: 0 }
 *               ativo: { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Grade criada
 *       409:
 *         description: Conflito de horário
 */
router.post("/", requireAdmin, createGrade);

/**
 * @swagger
 * /grade-programas/{id}:
 *   put:
 *     summary: Atualiza entrada de grade
 *     tags: [Grade de Programas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Grade atualizada
 */
router.put("/:id", requireAdmin, updateGrade);

/**
 * @swagger
 * /grade-programas/{id}:
 *   delete:
 *     summary: Remove entrada de grade
 *     tags: [Grade de Programas]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Removida
 */
router.delete("/:id", requireAdmin, removeGrade);

export default router;

import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import { getCurrent, getNext, getSchedule, getQueue, regenerate } from "./radio.controller.js";

/**
 * @swagger
 * tags:
 *   name: Rádio
 *   description: Estado em tempo real do player e fila com vinhetas
 */

const router = Router();

router.use(authenticate);
router.get("/current", getCurrent);
router.get("/next", getNext);
router.get("/schedule", getSchedule);

/**
 * @swagger
 * /api/radio/queue:
 *   get:
 *     tags: [Rádio]
 *     summary: Fila do dia com vinhetas injetadas
 *     description: >
 *       Retorna todos os itens da playlist do dia enriquecidos com vinhetas de abertura,
 *       encerramento, transição e pré-conteúdo, conforme o bloco horário.
 *     parameters:
 *       - in: query
 *         name: date
 *         schema: { type: string, example: "2026-05-26" }
 *         description: "Data no formato YYYY-MM-DD (padrão: hoje)"
 *       - in: query
 *         name: channel_id
 *         schema: { type: integer }
 *         description: "ID do canal (padrão: canal padrão do sistema)"
 *     responses:
 *       200:
 *         description: Fila com vinhetas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           starts_at:    { type: string, format: date-time }
 *                           duration_sec: { type: integer }
 *                           tipo:         { type: string }
 *                           is_vinheta:   { type: boolean }
 *                           vinheta_id:   { type: integer, nullable: true }
 *                           content_id:   { type: integer, nullable: true }
 *                           audio_url:    { type: string, nullable: true }
 *                           titulo:       { type: string }
 */
router.get("/queue", getQueue);

/**
 * @swagger
 * /api/radio/regenerate:
 *   post:
 *     tags: [Rádio]
 *     summary: Força rematerialização da playlist do dia (admin)
 *     description: >
 *       Resolve todos os blocos da grade de programas para o canal/data informados,
 *       cria/atualiza os registros em `playlists` + `playlist_items` e recarrega
 *       o estado do AutoDJ. Se channel_id for omitido, processa todos os canais ativos.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               channel_id:
 *                 type: integer
 *                 description: "ID do canal (omitir para regenerar todos os canais ativos)"
 *               date:
 *                 type: string
 *                 example: "2026-05-27"
 *                 description: "Data YYYY-MM-DD (padrão: hoje)"
 *     responses:
 *       200:
 *         description: Resultado da regeneração
 */
router.post("/regenerate", requireAdmin, regenerate);

export default router;

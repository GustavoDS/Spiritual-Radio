import type { Request, Response } from "express";
import { Op } from "sequelize";
import { ok } from "../../utils/response.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { DayBlockItem, GradePrograma, Content, Vinheta, sequelize } from "../../models/index.js";

/* ─── Serializer ────────────────────────────────────────────────────────── */

type RawDayBlockItem = InstanceType<typeof DayBlockItem> & {
  content?: InstanceType<typeof Content> | null;
  vinheta?: InstanceType<typeof Vinheta> | null;
};

/**
 * Serializes a DayBlockItem (with eagerly-loaded `content` and `vinheta`
 * associations) into the shape the frontend expects.
 *
 * Priority for audio/titulo:
 *   1. Content record (when content_id is set)
 *   2. Vinheta record (when vinheta_id is set — tipo='vinheta' slots)
 *   3. null (manual placeholder with no audio yet)
 *
 * Never returns synthetic fallbacks like "Item 0" or `{ id: 0 }`.
 */
function serializeItem(item: RawDayBlockItem) {
  const c = item.content ?? null;
  const v = item.vinheta ?? null;

  const audioUrl: string | null = c
    ? ((c as InstanceType<typeof Content> & { mixed_audio_url?: string | null }).mixed_audio_url
        ?? c.audio_url
        ?? null)
    : (v?.audio_url ?? null);

  const titulo: string | null = c?.titulo ?? v?.nome ?? null;

  return {
    id: item.id,
    ordem: item.ordem,
    date: item.date,
    channel_id: item.channel_id ?? null,
    grade_id: item.grade_id,
    programa_id: item.programa_id,
    tipo: item.tipo,
    duracao_sec: item.duracao_sec,
    source: item.source,
    content_id: item.content_id ?? null,
    vinheta_id: item.vinheta_id ?? null,
    titulo,
    audio_url: audioUrl,
    content: c
      ? {
          id: c.id,
          titulo: c.titulo,
          tipo: c.tipo,
          audio_url: audioUrl,
          imagem_url:
            (c as InstanceType<typeof Content> & { imagem_url?: string | null }).imagem_url ?? null,
          duracao: c.duracao,
          status: (c as InstanceType<typeof Content> & { status?: string | null }).status ?? null,
        }
      : null,
  };
}

/** Loads DayBlockItem rows with Content + Vinheta joins and serializes each one. */
async function loadEnriched(where: Record<string, unknown>) {
  const rows = await DayBlockItem.findAll({
    where,
    include: [
      { model: Content, as: "content", required: false },
      { model: Vinheta, as: "vinheta", required: false },
    ],
    order: [
      ["grade_id", "ASC"],
      ["ordem", "ASC"],
    ],
  });
  return (rows as RawDayBlockItem[]).map(serializeItem);
}

/* ─── GET /day-block-items ─────────────────────────────────────────────── */

/**
 * @swagger
 * /day-block-items:
 *   get:
 *     summary: Lista itens materializados de um dia (com dados de content e vinheta)
 *     tags: [Day Block Items]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: channel_id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: grade_id
 *         schema: { type: integer }
 *         description: Filtrar por bloco específico
 *     responses:
 *       200:
 *         description: Itens do dia com titulo, audio_url, content e vinheta expandidos
 */
export async function getItems(req: Request, res: Response): Promise<void> {
  const date = req.query["date"] as string | undefined;
  const channelId = Number(req.query["channel_id"]);
  const gradeId = req.query["grade_id"] ? Number(req.query["grade_id"]) : undefined;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError("date é obrigatório no formato YYYY-MM-DD", 400);
  }
  if (!Number.isFinite(channelId) || channelId <= 0) {
    throw new HttpError("channel_id é obrigatório e deve ser um inteiro positivo", 400);
  }

  const where: Record<string, unknown> = { date, channel_id: channelId };
  if (gradeId !== undefined && Number.isFinite(gradeId)) where["grade_id"] = gradeId;

  const items = await loadEnriched(where);
  ok(res, { items, count: items.length, date, channel_id: channelId });
}

/* ─── PUT /day-block-items/bulk ────────────────────────────────────────── */

interface BulkItemInput {
  ordem: number;
  tipo: string;
  content_id?: number | null;
  vinheta_id?: number | null;
  duracao_sec: number;
}

/**
 * @swagger
 * /day-block-items/bulk:
 *   put:
 *     summary: Substitui atomicamente os itens de um bloco (edição de programação)
 *     tags: [Day Block Items]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date, channel_id, grade_id, items]
 *             properties:
 *               date: { type: string, format: date }
 *               channel_id: { type: integer }
 *               grade_id: { type: integer }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [ordem, tipo, duracao_sec]
 *                   properties:
 *                     ordem: { type: integer }
 *                     tipo: { type: string }
 *                     content_id: { type: integer, nullable: true }
 *                     vinheta_id: { type: integer, nullable: true }
 *                     duracao_sec: { type: integer, minimum: 0 }
 *     responses:
 *       200:
 *         description: Itens do bloco substituídos (com titulo, audio_url e content/vinheta expandidos)
 *       400:
 *         description: Validação falhou
 *       404:
 *         description: grade_id não encontrado
 */
export async function bulkUpdate(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const date = body["date"] as string | undefined;
  const channelId = body["channel_id"] !== undefined ? Number(body["channel_id"]) : NaN;
  const gradeId = body["grade_id"] !== undefined ? Number(body["grade_id"]) : NaN;
  const items = body["items"];

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError("date é obrigatório no formato YYYY-MM-DD", 400);
  }
  if (!Number.isFinite(channelId) || channelId <= 0) {
    throw new HttpError("channel_id é obrigatório e deve ser um inteiro positivo", 400);
  }
  if (!Number.isFinite(gradeId) || gradeId <= 0) {
    throw new HttpError("grade_id é obrigatório e deve ser um inteiro positivo", 400);
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError("items deve ser um array não vazio", 400);
  }

  const typedItems = items as BulkItemInput[];

  for (const [i, item] of typedItems.entries()) {
    if (typeof item.ordem !== "number" || !Number.isInteger(item.ordem) || item.ordem < 0) {
      throw new HttpError(`items[${i}].ordem deve ser inteiro >= 0`, 400);
    }
    if (!item.tipo || typeof item.tipo !== "string") {
      throw new HttpError(`items[${i}].tipo é obrigatório`, 400);
    }
    if (typeof item.duracao_sec !== "number" || item.duracao_sec < 0) {
      throw new HttpError(`items[${i}].duracao_sec deve ser >= 0`, 400);
    }
  }

  const ordens = typedItems.map((i) => i.ordem);
  if (new Set(ordens).size !== ordens.length) {
    throw new HttpError("Valores de ordem duplicados na lista de itens", 400);
  }

  // Validate content_ids
  const contentIds = [
    ...new Set(
      typedItems.map((i) => i.content_id).filter((id): id is number => id != null && id > 0),
    ),
  ];
  if (contentIds.length > 0) {
    const found = await Content.findAll({ where: { id: { [Op.in]: contentIds } }, attributes: ["id"] });
    if (found.length !== contentIds.length) {
      const foundIds = new Set(found.map((c) => c.id));
      const missing = contentIds.filter((id) => !foundIds.has(id));
      throw new HttpError(`content_id(s) não encontrados: ${missing.join(", ")}`, 400);
    }
  }

  // Validate vinheta_ids
  const vinhetaIds = [
    ...new Set(
      typedItems.map((i) => i.vinheta_id).filter((id): id is number => id != null && id > 0),
    ),
  ];
  if (vinhetaIds.length > 0) {
    const found = await Vinheta.findAll({ where: { id: { [Op.in]: vinhetaIds } }, attributes: ["id"] });
    if (found.length !== vinhetaIds.length) {
      const foundIds = new Set(found.map((v) => v.id));
      const missing = vinhetaIds.filter((id) => !foundIds.has(id));
      throw new HttpError(`vinheta_id(s) não encontrados: ${missing.join(", ")}`, 400);
    }
  }

  const grade = await GradePrograma.findByPk(gradeId);
  if (!grade) throw new HttpError(`grade_id ${gradeId} não encontrado`, 404);
  const programaId = grade.programa_id;

  await sequelize.transaction(async () => {
    await DayBlockItem.destroy({
      where: { date, channel_id: channelId, grade_id: gradeId },
    });
    await DayBlockItem.bulkCreate(
      typedItems.map((item) => ({
        date,
        channel_id: channelId,
        grade_id: gradeId,
        programa_id: programaId,
        ordem: item.ordem,
        tipo: item.tipo,
        content_id: item.content_id ?? null,
        vinheta_id: item.vinheta_id ?? null,
        duracao_sec: item.duracao_sec,
        source: "manual" as const,
      })) as Parameters<typeof DayBlockItem.bulkCreate>[0],
      { returning: true },
    );
  });

  const enriched = await loadEnriched({ date, channel_id: channelId, grade_id: gradeId });
  ok(res, { items: enriched, count: enriched.length, date, channel_id: channelId, grade_id: gradeId });
}

/* ─── DELETE /day-block-items ──────────────────────────────────────────── */

/**
 * @swagger
 * /day-block-items:
 *   delete:
 *     summary: Limpa a materialização de um dia (próximo resolve-day re-sorteia)
 *     tags: [Day Block Items]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: channel_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Itens deletados
 */
export async function clearDay(req: Request, res: Response): Promise<void> {
  const date = req.query["date"] as string | undefined;
  const channelId = Number(req.query["channel_id"]);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError("date é obrigatório no formato YYYY-MM-DD", 400);
  }
  if (!Number.isFinite(channelId) || channelId <= 0) {
    throw new HttpError("channel_id é obrigatório e deve ser um inteiro positivo", 400);
  }

  const deleted = await DayBlockItem.destroy({ where: { date, channel_id: channelId } });
  ok(res, { deleted, date, channel_id: channelId });
}

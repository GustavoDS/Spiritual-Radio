import type { Request, Response } from "express";
import { schedulesService } from "./schedules.service.js";
import { ok, created, noContent, badRequest, paginated } from "../../utils/response.js";

/* ─── GET /schedule ──────────────────────────────────────────────────────── */

export async function getAll(req: Request, res: Response): Promise<void> {
  const channelId = req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined;
  const date = req.query["date"] as string | undefined;
  const result = await schedulesService.findAll({
    channelId,
    date,
    page: Number(req.query["page"]) || 1,
    limit: Number(req.query["limit"]) || 100,
  });
  paginated(res, result.items, result.total, result.page, result.limit);
}

/* ─── POST /schedule ─────────────────────────────────────────────────────── */

export async function create(req: Request, res: Response): Promise<void> {
  const { channel_id, horario_inicio, horario_fim, tipo, dias_semana, data, prioridade, ativo } = req.body as {
    channel_id?: number;
    horario_inicio?: string;
    horario_fim?: string;
    tipo?: string;
    dias_semana?: number[];
    data?: string | null;
    prioridade?: number;
    ativo?: boolean;
  };

  if (!channel_id || !horario_inicio || !horario_fim || !tipo) {
    badRequest(res, "channel_id, horario_inicio, horario_fim e tipo são obrigatórios");
    return;
  }

  created(res, await schedulesService.create({ channel_id, horario_inicio, horario_fim, tipo, dias_semana, data, prioridade, ativo }));
}

/* ─── PUT /schedule/:id ──────────────────────────────────────────────────── */

export async function update(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  ok(res, await schedulesService.update(id, req.body as Record<string, unknown>));
}

/* ─── DELETE /schedule/:id ───────────────────────────────────────────────── */

export async function remove(req: Request, res: Response): Promise<void> {
  await schedulesService.remove(Number(req.params["id"]));
  noContent(res);
}

/* ─── POST /schedule/bulk ────────────────────────────────────────────────── */

export async function bulk(req: Request, res: Response): Promise<void> {
  const { items } = req.body as { items?: unknown[] };
  if (!Array.isArray(items) || items.length === 0) {
    badRequest(res, "items deve ser um array não vazio");
    return;
  }
  const result = await schedulesService.bulk(items as Parameters<typeof schedulesService.bulk>[0]);
  if (result.errors.length > 0 && result.created.length === 0) {
    res.status(422).json({ success: false, message: "Nenhum item criado (transação revertida)", errors: result.errors });
    return;
  }
  created(res, result);
}

/* ─── POST /schedule/:id/duplicate ──────────────────────────────────────── */

export async function duplicate(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const overrides = (req.body as Record<string, unknown>)["overrides"] ?? {};
  created(res, await schedulesService.duplicate(id, overrides as Parameters<typeof schedulesService.duplicate>[1]));
}

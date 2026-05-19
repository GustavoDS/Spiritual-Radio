import type { Request, Response } from "express";
import { schedulesService } from "./schedules.service.js";
import { ok, created, noContent, badRequest, paginated } from "../../utils/response.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  const channelId = req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined;
  const data = req.query["data"] as string | undefined;
  const result = await schedulesService.findAll({
    channelId,
    data,
    page: Number(req.query["page"]) || 1,
    limit: Number(req.query["limit"]) || 50,
  });
  paginated(res, result.items, result.total, result.page, result.limit);
}

export async function create(req: Request, res: Response): Promise<void> {
  const { channel_id, horario_inicio, horario_fim, tipo } = req.body as {
    channel_id?: number;
    horario_inicio?: string;
    horario_fim?: string;
    tipo?: string;
  };
  if (!channel_id || !horario_inicio || !horario_fim || !tipo) {
    badRequest(res, "channel_id, horario_inicio, horario_fim e tipo são obrigatórios");
    return;
  }
  created(res, await schedulesService.create({ channel_id, horario_inicio, horario_fim, tipo }));
}

export async function remove(req: Request, res: Response): Promise<void> {
  await schedulesService.remove(Number(req.params["id"]));
  noContent(res);
}

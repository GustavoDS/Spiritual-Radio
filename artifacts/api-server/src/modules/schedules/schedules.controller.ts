import type { Request, Response } from "express";
import { schedulesService } from "./schedules.service.js";
import { ok, created, badRequest } from "../../utils/response.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  const channelId = req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined;
  const data = req.query["data"] as string | undefined;
  ok(res, await schedulesService.findAll(channelId, data));
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

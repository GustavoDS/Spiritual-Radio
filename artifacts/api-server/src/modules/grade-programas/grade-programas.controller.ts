import type { Request, Response } from "express";
import { gradeProgramasService } from "./grade-programas.service.js";
import { ok, created, noContent, paginated } from "../../utils/response.js";
import { HttpError } from "../../middlewares/errorHandler.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  const result = await gradeProgramasService.findAll({
    channel_id: req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined,
    dia: req.query["dia"] !== undefined ? Number(req.query["dia"]) : undefined,
    data: req.query["data"] as string | undefined,
    ativo: req.query["ativo"] !== undefined ? req.query["ativo"] === "true" : undefined,
    page: Number(req.query["page"]) || 1,
    limit: Number(req.query["limit"]) || 50,
  });
  paginated(res, result.items, result.total, result.page, result.limit);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const g = await gradeProgramasService.findById(Number(req.params["id"]));
  ok(res, g);
}

export async function createGrade(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const grade = await gradeProgramasService.create({
    programa_id: Number(body["programa_id"]),
    channel_id: Number(body["channel_id"]),
    horario_inicio: body["horario_inicio"] as string,
    dias_semana: Array.isArray(body["dias_semana"]) ? (body["dias_semana"] as number[]) : undefined,
    data: body["data"] as string | null | undefined,
    prioridade: body["prioridade"] !== undefined ? Number(body["prioridade"]) : undefined,
    ativo: body["ativo"] !== undefined ? Boolean(body["ativo"]) : undefined,
  });
  created(res, grade);
}

export async function updateGrade(req: Request, res: Response): Promise<void> {
  const grade = await gradeProgramasService.update(
    Number(req.params["id"]),
    req.body as Record<string, unknown>,
  );
  ok(res, grade, "Grade atualizada");
}

export async function removeGrade(req: Request, res: Response): Promise<void> {
  await gradeProgramasService.remove(Number(req.params["id"]));
  noContent(res);
}

export async function bulkCreate(req: Request, res: Response): Promise<void> {
  const body = req.body as { items: Parameters<typeof gradeProgramasService.create>[0][] };
  if (!Array.isArray(body?.items)) {
    res.status(400).json({ message: "Body deve conter { items: [...] }" });
    return;
  }
  const grades = await gradeProgramasService.bulk(body.items);
  created(res, grades);
}

export async function resolveDay(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;

  const channelId = Number(body["channel_id"]);
  if (!Number.isFinite(channelId) || channelId <= 0) {
    throw new HttpError("channel_id é obrigatório e deve ser um inteiro positivo", 400);
  }

  const date = typeof body["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body["date"])
    ? body["date"]
    : new Date().toISOString().slice(0, 10);

  const result = await gradeProgramasService.resolveDay(channelId, date);
  ok(res, result);
}

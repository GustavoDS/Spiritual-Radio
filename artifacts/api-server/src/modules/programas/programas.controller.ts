import type { Request, Response } from "express";
import { programasService } from "./programas.service.js";
import { resolveService } from "../../services/ResolveService.js";
import { ok, created, paginated } from "../../utils/response.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import type { BlocoPrograma } from "../../models/Programa.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  const result = await programasService.findAll({
    channel_id: req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined,
    bloco: req.query["bloco"] as string | undefined,
    ativo: req.query["ativo"] !== undefined ? req.query["ativo"] === "true" : undefined,
    page: Number(req.query["page"]) || 1,
    limit: Number(req.query["limit"]) || 20,
  });
  paginated(res, result.items, result.total, result.page, result.limit);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const programa = await programasService.findById(Number(req.params["id"]));
  ok(res, programa);
}

export async function createPrograma(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const programa = await programasService.create({
    nome: body["nome"] as string,
    descricao: body["descricao"] as string | undefined,
    duracao_min: Number(body["duracao_min"]),
    bloco: body["bloco"] as BlocoPrograma,
    receita: body["receita"] as import("../../models/Programa.js").ReceitaItem[],
    regras: body["regras"] as import("../../models/Programa.js").RegrasPrograma | undefined,
    channel_id: body["channel_id"] != null ? Number(body["channel_id"]) : undefined,
    ativo: body["ativo"] !== undefined ? Boolean(body["ativo"]) : true,
  });
  created(res, programa);
}

export async function updatePrograma(req: Request, res: Response): Promise<void> {
  const programa = await programasService.update(Number(req.params["id"]), req.body as Record<string, unknown>);
  ok(res, programa, "Programa atualizado");
}

export async function deletePrograma(req: Request, res: Response): Promise<void> {
  const result = await programasService.softDelete(Number(req.params["id"]));
  ok(res, result, "Programa desativado");
}

export async function duplicatePrograma(req: Request, res: Response): Promise<void> {
  const programa = await programasService.duplicate(
    Number(req.params["id"]),
    req.body as Record<string, unknown>,
  );
  created(res, programa);
}

export async function resolvePrograma(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const channelId = Number(body["channel_id"]);
  if (!Number.isFinite(channelId) || channelId <= 0) {
    throw new HttpError("channel_id é obrigatório e deve ser um inteiro positivo", 400);
  }
  const date = body["date"] as string | undefined;
  if (!date) throw new HttpError("date é obrigatório (YYYY-MM-DD)", 400);

  const result = await resolveService.resolve(
    Number(req.params["id"]),
    channelId,
    date,
    (body["starts_at"] as string | undefined) ?? null,
    body["seed"] as string | undefined,
  );
  ok(res, result);
}

export async function seedProgramas(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const channelId = body["channel_id"] ? Number(body["channel_id"]) : undefined;
  const programas = await programasService.seed(channelId);
  ok(res, programas, `${programas.length} programa(s) criado(s)`);
}

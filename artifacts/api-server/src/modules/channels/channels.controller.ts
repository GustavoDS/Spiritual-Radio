import type { Request, Response } from "express";
import { channelsService } from "./channels.service.js";
import { ok, created, noContent, badRequest } from "../../utils/response.js";

export async function getAll(_req: Request, res: Response): Promise<void> {
  ok(res, await channelsService.findAll());
}

export async function getById(req: Request, res: Response): Promise<void> {
  ok(res, await channelsService.findById(Number(req.params["id"])));
}

export async function create(req: Request, res: Response): Promise<void> {
  const { nome } = req.body as { nome?: string };
  if (!nome) { badRequest(res, "nome é obrigatório"); return; }
  created(res, await channelsService.create(req.body as { nome: string; descricao?: string }));
}

export async function update(req: Request, res: Response): Promise<void> {
  ok(res, await channelsService.update(Number(req.params["id"]), req.body as Record<string, unknown>), "Canal atualizado");
}

export async function remove(req: Request, res: Response): Promise<void> {
  await channelsService.remove(Number(req.params["id"]));
  noContent(res);
}

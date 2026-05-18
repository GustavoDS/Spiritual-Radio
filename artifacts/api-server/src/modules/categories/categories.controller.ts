import type { Request, Response } from "express";
import { categoriesService } from "./categories.service.js";
import { ok, created, noContent, badRequest } from "../../utils/response.js";

export async function getAll(_req: Request, res: Response): Promise<void> {
  ok(res, await categoriesService.findAll());
}

export async function getById(req: Request, res: Response): Promise<void> {
  ok(res, await categoriesService.findById(Number(req.params["id"])));
}

export async function create(req: Request, res: Response): Promise<void> {
  const { nome } = req.body as { nome?: string };
  if (!nome) { badRequest(res, "nome é obrigatório"); return; }
  created(res, await categoriesService.create(nome));
}

export async function update(req: Request, res: Response): Promise<void> {
  const { nome } = req.body as { nome?: string };
  if (!nome) { badRequest(res, "nome é obrigatório"); return; }
  ok(res, await categoriesService.update(Number(req.params["id"]), nome), "Categoria atualizada");
}

export async function remove(req: Request, res: Response): Promise<void> {
  await categoriesService.remove(Number(req.params["id"]));
  noContent(res);
}

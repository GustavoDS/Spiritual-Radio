import type { Request, Response } from "express";
import { voicesService } from "./voices.service.js";
import { ok, created, noContent, paginated } from "../../utils/response.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  const result = await voicesService.findAll({
    page: Number(req.query["page"]) || 1,
    limit: Number(req.query["limit"]) || 20,
    includeInactive: req.query["includeInactive"] === "true",
  });
  paginated(res, result.items, result.total, result.page, result.limit);
}

export async function getById(req: Request, res: Response): Promise<void> {
  ok(res, await voicesService.findById(Number(req.params["id"])));
}

export async function create(req: Request, res: Response): Promise<void> {
  created(res, await voicesService.create(req.body as Parameters<typeof voicesService.create>[0]));
}

export async function update(req: Request, res: Response): Promise<void> {
  ok(res, await voicesService.update(Number(req.params["id"]), req.body as Record<string, unknown>), "Voz atualizada");
}

export async function remove(req: Request, res: Response): Promise<void> {
  await voicesService.remove(Number(req.params["id"]));
  noContent(res);
}

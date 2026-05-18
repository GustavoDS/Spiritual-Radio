import type { Request, Response } from "express";
import { voicesService } from "./voices.service.js";
import { ok } from "../../utils/response.js";

export async function getAll(_req: Request, res: Response): Promise<void> {
  ok(res, await voicesService.findAll());
}

export async function getById(req: Request, res: Response): Promise<void> {
  ok(res, await voicesService.findById(Number(req.params["id"])));
}

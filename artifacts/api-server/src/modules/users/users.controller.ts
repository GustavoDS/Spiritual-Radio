import type { Request, Response } from "express";
import { usersService } from "./users.service.js";
import { ok, noContent } from "../../utils/response.js";

export async function getAll(_req: Request, res: Response): Promise<void> {
  const users = await usersService.findAll();
  ok(res, users);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const user = await usersService.findById(Number(req.params["id"]));
  ok(res, user);
}

export async function update(req: Request, res: Response): Promise<void> {
  const user = await usersService.update(Number(req.params["id"]), req.body as Record<string, unknown>);
  ok(res, user, "Usuário atualizado");
}

export async function remove(req: Request, res: Response): Promise<void> {
  await usersService.remove(Number(req.params["id"]));
  noContent(res);
}

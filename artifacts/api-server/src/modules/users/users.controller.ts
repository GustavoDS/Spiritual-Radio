import type { Request, Response } from "express";
import { usersService } from "./users.service.js";
import { ok, noContent, forbidden } from "../../utils/response.js";

export async function getAll(_req: Request, res: Response): Promise<void> {
  const users = await usersService.findAll();
  ok(res, users);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const targetId = Number(req.params["id"]);
  if (req.user!.id !== targetId && req.user!.role !== "admin") {
    forbidden(res, "Acesso negado — você só pode visualizar seu próprio perfil");
    return;
  }
  const user = await usersService.findById(targetId);
  ok(res, user);
}

export async function update(req: Request, res: Response): Promise<void> {
  const targetId = Number(req.params["id"]);
  if (req.user!.id !== targetId && req.user!.role !== "admin") {
    forbidden(res, "Acesso negado — você só pode editar seu próprio perfil");
    return;
  }

  const body = req.body as Record<string, unknown>;

  if (req.user!.role !== "admin") {
    delete body["role"];
  }

  const user = await usersService.update(targetId, body);
  ok(res, user, "Usuário atualizado");
}

export async function remove(req: Request, res: Response): Promise<void> {
  await usersService.remove(Number(req.params["id"]));
  noContent(res);
}

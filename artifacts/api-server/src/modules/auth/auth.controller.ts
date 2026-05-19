import type { Request, Response } from "express";
import { authService } from "./auth.service.js";
import { created, ok, badRequest } from "../../utils/response.js";

export async function register(req: Request, res: Response): Promise<void> {
  const { nome, email, senha } = req.body as {
    nome: string;
    email: string;
    senha: string;
  };

  if (!nome || !email || !senha) {
    badRequest(res, "nome, email e senha são obrigatórios");
    return;
  }

  const result = await authService.register({ nome, email, senha });
  created(res, result, "Usuário registrado com sucesso");
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, senha } = req.body as { email: string; senha: string };

  if (!email || !senha) {
    badRequest(res, "email e senha são obrigatórios");
    return;
  }

  const result = await authService.login({ email, senha });
  ok(res, result, "Login realizado com sucesso");
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken: string };
  const result = await authService.refresh(refreshToken);
  ok(res, result, "Token renovado com sucesso");
}

export async function logout(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers["authorization"];
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const { refreshToken } = req.body as { refreshToken?: string };
  const result = await authService.logout(accessToken, refreshToken);
  ok(res, result);
}

export async function recover(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email: string };
  if (!email) {
    badRequest(res, "email é obrigatório");
    return;
  }
  const result = await authService.recover(email);
  ok(res, result);
}

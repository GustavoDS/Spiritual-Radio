import type { Response } from "express";

export function ok<T>(res: Response, data: T, message = "OK"): Response {
  return res.status(200).json({ success: true, message, data });
}

export function created<T>(res: Response, data: T, message = "Criado com sucesso"): Response {
  return res.status(201).json({ success: true, message, data });
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export function badRequest(res: Response, message = "Dados inválidos"): Response {
  return res.status(400).json({ success: false, message });
}

export function unauthorized(res: Response, message = "Não autorizado"): Response {
  return res.status(401).json({ success: false, message });
}

export function forbidden(res: Response, message = "Acesso proibido"): Response {
  return res.status(403).json({ success: false, message });
}

export function notFound(res: Response, message = "Não encontrado"): Response {
  return res.status(404).json({ success: false, message });
}

export function conflict(res: Response, message = "Conflito de dados"): Response {
  return res.status(409).json({ success: false, message });
}

export function serverError(res: Response, message = "Erro interno do servidor"): Response {
  return res.status(500).json({ success: false, message });
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function paginated<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  limit: number,
): Response {
  return res.status(200).json({
    success: true,
    data: {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}

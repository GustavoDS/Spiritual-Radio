import type { Request, Response } from "express";
import { aiService } from "../../services/AiService.js";
import { ok } from "../../utils/response.js";

export async function generate(req: Request, res: Response): Promise<void> {
  const { tema, tipo, duracao, estilo } = req.body as {
    tema: string;
    tipo: string;
    duracao?: number;
    estilo?: string;
  };
  const result = await aiService.generateContent({ tema, tipo, duracao, estilo });
  ok(res, result, "Conteúdo gerado com sucesso");
}

export async function generateScript(req: Request, res: Response): Promise<void> {
  const { tema, duracao } = req.body as { tema: string; duracao?: number };
  const result = await aiService.generateScript(tema, duracao ?? 120);
  ok(res, { script: result });
}

export async function summarize(req: Request, res: Response): Promise<void> {
  const { text } = req.body as { text: string };
  const result = await aiService.summarize(text);
  ok(res, { summary: result });
}

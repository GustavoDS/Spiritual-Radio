import { logger } from "../lib/logger.js";

export interface GenerateContentOptions {
  tema: string;
  tipo: string;
  duracao?: number;
  estilo?: string;
}

export interface GeneratedContent {
  titulo: string;
  texto: string;
  tags: string[];
  duracao: number;
}

export class AiService {
  async generateContent(opts: GenerateContentOptions): Promise<GeneratedContent> {
    logger.info("AiService.generateContent", { opts });
    return {
      titulo: `${opts.tipo}: ${opts.tema}`,
      texto: `Conteúdo gerado por IA sobre "${opts.tema}" no estilo "${opts.estilo ?? "espiritual"}"`,
      tags: [opts.tema, opts.tipo, "gerado-por-ia"],
      duracao: opts.duracao ?? 120,
    };
  }

  async generateScript(tema: string, duracao: number): Promise<string> {
    logger.info("AiService.generateScript", { tema, duracao });
    return `Roteiro espiritual sobre "${tema}" com ${duracao} segundos de duração.`;
  }

  async summarize(text: string): Promise<string> {
    logger.info("AiService.summarize", { length: text.length });
    return text.slice(0, 200) + "...";
  }
}

export const aiService = new AiService();

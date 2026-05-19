import { z } from "zod";

function sanitize(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

function sanitizeOptional(s: string | undefined): string | undefined {
  return s ? sanitize(s) : s;
}

export const contactSchema = z
  .object({
    nome: z.string({ required_error: "nome é obrigatório" }).min(2, "mínimo 2 caracteres").max(255).transform(sanitize),
    email: z.string().email("email inválido").max(255).optional(),
    telefone: z.string().max(50).optional().transform(sanitizeOptional),
    assunto: z.string({ required_error: "assunto é obrigatório" }).min(3, "mínimo 3 caracteres").max(255).transform(sanitize),
    mensagem: z.string({ required_error: "mensagem é obrigatória" }).min(10, "mínimo 10 caracteres").max(5000, "máximo 5000 caracteres").transform(sanitize),
    canal_origem: z.string().max(100).optional().transform(sanitizeOptional),
    tipo: z.enum(["contato", "testemunho", "sugestao"]).default("contato"),
  })
  .strict();

export const prayerRequestSchema = z
  .object({
    nome: z.string({ required_error: "nome é obrigatório" }).min(2, "mínimo 2 caracteres").max(255).transform(sanitize),
    email: z.string().email("email inválido").max(255).optional(),
    telefone: z.string().max(50).optional().transform(sanitizeOptional),
    mensagem: z.string({ required_error: "pedido é obrigatório" }).min(10, "mínimo 10 caracteres").max(5000, "máximo 5000 caracteres").transform(sanitize),
    canal_origem: z.string().max(100).optional().transform(sanitizeOptional),
    prioridade: z.enum(["baixa", "normal", "alta", "urgente"]).default("normal"),
  })
  .strict();

export const updateStatusSchema = z
  .object({
    status: z.enum(["novo", "em_analise", "respondido", "arquivado"], { required_error: "status é obrigatório" }),
  })
  .strict();

export const respondSchema = z
  .object({
    resposta_admin: z
      .string({ required_error: "resposta é obrigatória" })
      .min(5, "resposta muito curta")
      .max(10_000, "máximo 10000 caracteres")
      .transform(sanitize),
  })
  .strict();

export const listMessagesQuerySchema = z.object({
  status: z.enum(["novo", "em_analise", "respondido", "arquivado"]).optional(),
  tipo: z.enum(["contato", "pedido_oracao", "testemunho", "sugestao"]).optional(),
  prioridade: z.enum(["baixa", "normal", "alta", "urgente"]).optional(),
  desde: z.string().optional(),
  ate: z.string().optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type PrayerRequestInput = z.infer<typeof prayerRequestSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type RespondInput = z.infer<typeof respondSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

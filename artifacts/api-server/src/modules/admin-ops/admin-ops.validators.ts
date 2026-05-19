import { z } from "zod";

export const updatePrioritySchema = z
  .object({
    prioridade: z.enum(["baixa", "normal", "alta", "urgente"], { required_error: "prioridade é obrigatória" }),
  })
  .strict();

export const runNowSchema = z
  .object({
    channel_id: z.coerce.number().int().positive().optional(),
  })
  .strict();

export const generateTtsSchema = z
  .object({
    text: z
      .string({ required_error: "text é obrigatório" })
      .min(5, "texto muito curto (mínimo 5 caracteres)")
      .max(10_000, "máximo 10000 caracteres"),
    voice_id: z.coerce.number().int().positive().optional(),
  })
  .strict();

export type UpdatePriorityInput = z.infer<typeof updatePrioritySchema>;
export type RunNowInput = z.infer<typeof runNowSchema>;
export type GenerateTtsInput = z.infer<typeof generateTtsSchema>;

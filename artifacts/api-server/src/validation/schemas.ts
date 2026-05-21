import { z } from "zod";

export const registerSchema = z.object({
  nome: z.string({ required_error: "nome é obrigatório" }).min(2, "nome deve ter ao menos 2 caracteres").max(255),
  email: z.string({ required_error: "email é obrigatório" }).email("email inválido"),
  senha: z.string({ required_error: "senha é obrigatória" }).min(6, "senha deve ter ao menos 6 caracteres"),
});

export const loginSchema = z.object({
  email: z.string({ required_error: "email é obrigatório" }).email("email inválido"),
  senha: z.string({ required_error: "senha é obrigatória" }).min(1, "senha é obrigatória"),
});

export const recoverSchema = z.object({
  email: z.string({ required_error: "email é obrigatório" }).email("email inválido"),
});

export const refreshSchema = z.object({
  refreshToken: z.string({ required_error: "refreshToken é obrigatório" }).min(1),
});

export const createChannelSchema = z.object({
  nome: z.string({ required_error: "nome é obrigatório" }).min(1, "nome é obrigatório").max(255),
  descricao: z.string().max(5000).optional(),
  ativo: z.boolean().optional(),
});

export const updateChannelSchema = createChannelSchema.partial();

export const createCategorySchema = z.object({
  nome: z.string({ required_error: "nome é obrigatório" }).min(1, "nome é obrigatório").max(255),
});

export const updateCategorySchema = createCategorySchema;

const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/;
const timeField = (label: string) =>
  z.string({ required_error: `${label} é obrigatório` })
    .regex(timeRegex, `${label} deve estar no formato HH:MM ou HH:MM:SS`);

const diasSemanaField = z
  .array(z.number().int().min(0, "dia deve ser 0–6").max(6, "dia deve ser 0–6"))
  .min(1, "dias_semana não pode ser vazio")
  .refine((arr) => new Set(arr).size === arr.length, "dias_semana não pode ter duplicados")
  .optional();

export const createScheduleSchema = z.object({
  channel_id: z.number({ required_error: "channel_id é obrigatório", invalid_type_error: "channel_id deve ser um número" }).int().positive("channel_id deve ser positivo"),
  horario_inicio: timeField("horario_inicio"),
  horario_fim: timeField("horario_fim"),
  tipo: z.string({ required_error: "tipo é obrigatório" }).min(1, "tipo é obrigatório").max(100),
  dias_semana: diasSemanaField,
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve estar no formato YYYY-MM-DD").optional().nullable(),
  prioridade: z.number().int().optional(),
  ativo: z.boolean().optional(),
}).refine((d) => d.horario_fim > d.horario_inicio, {
  message: "horario_fim deve ser maior que horario_inicio",
  path: ["horario_fim"],
});

export const updateScheduleSchema = z.object({
  horario_inicio: timeField("horario_inicio").optional(),
  horario_fim: timeField("horario_fim").optional(),
  tipo: z.string().min(1).max(100).optional(),
  dias_semana: diasSemanaField,
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve estar no formato YYYY-MM-DD").optional().nullable(),
  prioridade: z.number().int().optional(),
  ativo: z.boolean().optional(),
}).refine(
  (d) => !d.horario_inicio || !d.horario_fim || d.horario_fim > d.horario_inicio,
  { message: "horario_fim deve ser maior que horario_inicio", path: ["horario_fim"] },
);

export const createPlaylistSchema = z.object({
  channel_id: z.number({ required_error: "channel_id é obrigatório", invalid_type_error: "channel_id deve ser um número" }).int().positive(),
  data: z.string({ required_error: "data é obrigatória" }).regex(/^\d{4}-\d{2}-\d{2}$/, "data deve estar no formato YYYY-MM-DD"),
});

export const updatePlaylistSchema = createPlaylistSchema.partial();

export const createContentSchema = z.object({
  titulo: z.string({ required_error: "titulo é obrigatório" }).min(1).max(500),
  tipo: z.string({ required_error: "tipo é obrigatório" }).min(1).max(100),
  categoria_id: z.coerce.number().int().positive().optional(),
  channel_id: z.coerce.number().int().positive().optional(),
  duracao: z.coerce.number().int().positive().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  ativo: z.union([z.boolean(), z.string()]).optional(),
  audio_url: z.string().url().optional().or(z.literal("")),
  imagem_url: z.string().url().optional().or(z.literal("")),
});

export const updateContentSchema = createContentSchema.partial();

export const createVoiceSchema = z.object({
  nome: z.string({ required_error: "nome é obrigatório" }).min(1).max(255),
  voice_id_externo: z.string().max(255).optional(),
  provider: z.enum(["openai", "elevenlabs"], { required_error: "provider é obrigatório" }),
  horario_preferencial: z.enum(["manha", "tarde", "noite"]).optional(),
  ativo: z.boolean().optional(),
});

export const updateVoiceSchema = createVoiceSchema.partial();

export const generateAiSchema = z.object({
  tema: z.string({ required_error: "tema é obrigatório" }).min(1).max(500),
  tipo: z.string({ required_error: "tipo é obrigatório" }).min(1).max(100),
  duracao: z.coerce.number().int().positive().optional(),
  estilo: z.string().max(255).optional(),
});

export const generateScriptSchema = z.object({
  tema: z.string({ required_error: "tema é obrigatório" }).min(1).max(500),
  duracao: z.coerce.number().int().positive().optional().default(120),
});

export const synthesizeTtsSchema = z.object({
  voiceId: z.number({ required_error: "voiceId é obrigatório", invalid_type_error: "voiceId deve ser número" }).int().positive(),
  text: z.string({ required_error: "text é obrigatório" }).min(1).max(10_000),
});

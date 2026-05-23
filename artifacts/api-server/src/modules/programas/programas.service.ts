import { Op } from "sequelize";
import { Programa, Channel } from "../../models/index.js";
import type { ReceitaItem, RegrasPrograma, BlocoPrograma } from "../../models/Programa.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { logger } from "../../lib/logger.js";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface CreateProgramaDto {
  nome: string;
  descricao?: string | null;
  duracao_min: number;
  bloco: BlocoPrograma;
  receita: ReceitaItem[];
  regras?: RegrasPrograma;
  channel_id?: number | null;
  ativo?: boolean;
}

export type UpdateProgramaDto = Partial<CreateProgramaDto>;

export interface ProgramaFilters {
  channel_id?: number;
  bloco?: string;
  ativo?: boolean;
  page?: number;
  limit?: number;
}

/* ─── Validation helpers ────────────────────────────────────────────────── */

function validateReceita(receita: ReceitaItem[]): void {
  if (!Array.isArray(receita) || receita.length === 0) {
    throw new HttpError("receita deve ser um array não vazio de { tipo, pct }", 400);
  }
  const total = receita.reduce((s, r) => s + (r.pct ?? 0), 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new HttpError(`Soma das pct da receita deve ser 100 (atual: ${total})`, 400);
  }
  for (const item of receita) {
    if (!item.tipo || typeof item.tipo !== "string") {
      throw new HttpError("Cada item da receita deve ter um campo 'tipo' válido", 400);
    }
    if (typeof item.pct !== "number" || item.pct <= 0) {
      throw new HttpError(`pct inválido para tipo '${item.tipo}': deve ser > 0`, 400);
    }
  }
}

function validateDuracaoMin(duracao_min: number): void {
  if (!Number.isInteger(duracao_min) || duracao_min < 5 || duracao_min > 480) {
    throw new HttpError("duracao_min deve ser inteiro entre 5 e 480", 400);
  }
  if (duracao_min % 5 !== 0) {
    throw new HttpError("duracao_min deve ser múltiplo de 5", 400);
  }
}

/* ─── Service ────────────────────────────────────────────────────────────── */

export class ProgramasService {
  async findAll(filters: ProgramaFilters) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    if (filters.channel_id !== undefined) {
      where["channel_id"] = { [Op.or]: [filters.channel_id, null] };
    }
    if (filters.bloco) where["bloco"] = filters.bloco;
    if (filters.ativo !== undefined) where["ativo"] = filters.ativo;

    const { count, rows } = await Programa.findAndCountAll({
      where,
      include: [{ model: Channel, as: "channel", attributes: ["id", "nome"] }],
      order: [["nome", "ASC"]],
      limit,
      offset,
    });

    return { items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) };
  }

  async findById(id: number) {
    const programa = await Programa.findByPk(id, {
      include: [{ model: Channel, as: "channel", attributes: ["id", "nome"] }],
    });
    if (!programa) throw new HttpError("Programa não encontrado", 404);
    return programa;
  }

  async create(dto: CreateProgramaDto) {
    validateDuracaoMin(dto.duracao_min);
    validateReceita(dto.receita);

    if (dto.channel_id) {
      const ch = await Channel.findByPk(dto.channel_id);
      if (!ch) throw new HttpError("Canal não encontrado", 404);
    }

    const programa = await Programa.create({
      nome: dto.nome,
      descricao: dto.descricao ?? null,
      duracao_min: dto.duracao_min,
      bloco: dto.bloco,
      receita: dto.receita,
      regras: dto.regras ?? {},
      channel_id: dto.channel_id ?? null,
      ativo: dto.ativo ?? true,
    } as Parameters<typeof Programa.create>[0]);

    logger.info("Programa created", { id: programa.id, nome: dto.nome });
    return programa;
  }

  async update(id: number, dto: UpdateProgramaDto) {
    const programa = await Programa.findByPk(id);
    if (!programa) throw new HttpError("Programa não encontrado", 404);

    if (dto.duracao_min !== undefined) validateDuracaoMin(dto.duracao_min);
    if (dto.receita !== undefined) validateReceita(dto.receita);

    await programa.update(dto);
    return programa;
  }

  async softDelete(id: number) {
    const programa = await Programa.findByPk(id);
    if (!programa) throw new HttpError("Programa não encontrado", 404);
    await programa.update({ ativo: false });
    return { id, ativo: false };
  }

  async duplicate(id: number, overrides: UpdateProgramaDto = {}) {
    const original = await this.findById(id);
    const dto: CreateProgramaDto = {
      nome: overrides.nome ?? `${original.nome} (cópia)`,
      descricao: overrides.descricao ?? original.descricao,
      duracao_min: overrides.duracao_min ?? original.duracao_min,
      bloco: overrides.bloco ?? original.bloco,
      receita: overrides.receita ?? original.receita,
      regras: overrides.regras ?? original.regras,
      channel_id: overrides.channel_id !== undefined ? overrides.channel_id : original.channel_id,
      ativo: overrides.ativo ?? true,
    };
    return this.create(dto);
  }

  /* ── 7 seed programs ─────────────────────────────────────────────────── */
  async seed(channelId?: number) {
    const seeds: CreateProgramaDto[] = [
      {
        nome: "Madrugada Acolhedora",
        descricao: "Música suave e orações para as horas de madrugada",
        duracao_min: 300,
        bloco: "madrugada",
        channel_id: channelId ?? null,
        receita: [
          { tipo: "musica", pct: 50 },
          { tipo: "oracao", pct: 30 },
          { tipo: "mensagem", pct: 15 },
          { tipo: "vinheta", pct: 5 },
        ],
        regras: { abre_com: "vinheta", anti_repeticao_dias: 3, max_musicas_seguidas: 3 },
      },
      {
        nome: "Amanhecer Inspirador",
        descricao: "Louvor e adoração para começar o dia com Deus",
        duracao_min: 180,
        bloco: "amanhecer",
        channel_id: channelId ?? null,
        receita: [
          { tipo: "musica", pct: 60 },
          { tipo: "mensagem", pct: 25 },
          { tipo: "vinheta", pct: 10 },
          { tipo: "oracao", pct: 5 },
        ],
        regras: { abre_com: "vinheta", fecha_com: "oracao", anti_repeticao_dias: 3, max_musicas_seguidas: 2 },
      },
      {
        nome: "Manhã com Deus",
        descricao: "Programação matinal com pregações, músicas e devocionais",
        duracao_min: 240,
        bloco: "manha",
        channel_id: channelId ?? null,
        receita: [
          { tipo: "musica", pct: 50 },
          { tipo: "mensagem", pct: 30 },
          { tipo: "oracao", pct: 15 },
          { tipo: "vinheta", pct: 5 },
        ],
        regras: { abre_com: "vinheta", anti_repeticao_dias: 3, max_musicas_seguidas: 2 },
      },
      {
        nome: "Pausa do Almoço",
        descricao: "Momento de reflexão e música no horário do almoço",
        duracao_min: 120,
        bloco: "almoco",
        channel_id: channelId ?? null,
        receita: [
          { tipo: "musica", pct: 65 },
          { tipo: "mensagem", pct: 20 },
          { tipo: "vinheta", pct: 10 },
          { tipo: "oracao", pct: 5 },
        ],
        regras: { anti_repeticao_dias: 2, max_musicas_seguidas: 3 },
      },
      {
        nome: "Tarde Suave",
        descricao: "Adoração contemplativa para a tarde",
        duracao_min: 180,
        bloco: "tarde",
        channel_id: channelId ?? null,
        receita: [
          { tipo: "musica", pct: 60 },
          { tipo: "oracao", pct: 20 },
          { tipo: "mensagem", pct: 15 },
          { tipo: "vinheta", pct: 5 },
        ],
        regras: { anti_repeticao_dias: 3, max_musicas_seguidas: 3 },
      },
      {
        nome: "Prime Adoração",
        descricao: "Louvor intenso para o horário nobre",
        duracao_min: 60,
        bloco: "prime",
        channel_id: channelId ?? null,
        receita: [
          { tipo: "musica", pct: 70 },
          { tipo: "mensagem", pct: 20 },
          { tipo: "vinheta", pct: 10 },
        ],
        regras: { abre_com: "vinheta", anti_repeticao_dias: 1, max_musicas_seguidas: 4 },
      },
      {
        nome: "Devocional Profundo",
        descricao: "Mensagens e orações profundas para o período devocional",
        duracao_min: 120,
        bloco: "devocional",
        channel_id: channelId ?? null,
        receita: [
          { tipo: "mensagem", pct: 45 },
          { tipo: "musica", pct: 35 },
          { tipo: "oracao", pct: 15 },
          { tipo: "vinheta", pct: 5 },
        ],
        regras: { abre_com: "oracao", fecha_com: "oracao", anti_repeticao_dias: 5, max_musicas_seguidas: 2 },
      },
    ];

    const created: Programa[] = [];
    for (const dto of seeds) {
      // Idempotent: skip if a program with same name + channel already exists
      const existing = await Programa.findOne({
        where: {
          nome: dto.nome,
          channel_id: dto.channel_id ?? null,
        },
      });
      if (existing) continue;

      try {
        const p = await this.create(dto);
        created.push(p);
      } catch (err) {
        logger.warn("seed: skipping program", { nome: dto.nome, err: String(err) });
      }
    }
    return created;
  }
}

export const programasService = new ProgramasService();

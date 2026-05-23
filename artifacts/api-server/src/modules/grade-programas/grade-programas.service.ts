import { Op } from "sequelize";
import { sequelize, GradePrograma, Programa, Channel } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { resolveService } from "../../services/ResolveService.js";
import { logger } from "../../lib/logger.js";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface CreateGradeProgramaDto {
  programa_id: number;
  channel_id: number;
  horario_inicio: string;   // "HH:MM" or "HH:MM:SS"
  dias_semana?: number[];   // ignored when data is set
  data?: string | null;     // "YYYY-MM-DD" — date exception
  prioridade?: number;
  ativo?: boolean;
}

export type UpdateGradeProgramaDto = Partial<Omit<CreateGradeProgramaDto, "programa_id" | "channel_id">>;

export interface GradeProgramaFilters {
  channel_id?: number;
  dia?: number;              // weekday 0–6
  data?: string;             // YYYY-MM-DD
  ativo?: boolean;
  page?: number;
  limit?: number;
}

/* ─── Time helpers ───────────────────────────────────────────────────────── */

function normaliseTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

/**
 * Add minutes to a "HH:MM:SS" time string. Handles midnight wrap.
 * Returns "HH:MM:SS".
 */
function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h = "0", m = "0", s = "0"] = timeStr.split(":");
  const totalSec = Number(h) * 3600 + Number(m) * 60 + Number(s) + minutes * 60;
  const wrapped = totalSec % 86400;
  const hh = String(Math.floor(wrapped / 3600)).padStart(2, "0");
  const mm = String(Math.floor((wrapped % 3600) / 60)).padStart(2, "0");
  const ss = String(wrapped % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/* ─── Overlap detection ──────────────────────────────────────────────────── */

async function findConflict(
  channelId: number,
  programaId: number,
  horarioInicio: string,
  horarioFim: string,
  isDateSpecific: boolean,
  data: string | null,
  diasSemana: number[],
  excludeId?: number,
): Promise<GradePrograma | null> {
  const ini = normaliseTime(horarioInicio);
  const fim = normaliseTime(horarioFim);

  const base: Record<string, unknown> = {
    channel_id: channelId,
    ativo: true,
    horario_inicio: { [Op.lt]: fim },
  };
  if (excludeId) base["id"] = { [Op.ne]: excludeId };

  if (isDateSpecific) {
    // date exception conflicts with other date exceptions on the same date
    return GradePrograma.findOne({
      where: {
        ...base,
        data,
        [Op.and]: [
          sequelize.where(
            sequelize.literal(`horario_inicio + (
              SELECT duracao_min FROM programas WHERE id = "GradePrograma".programa_id
            ) * interval '1 minute'`),
            { [Op.gt]: ini },
          ),
        ],
      },
    });
  }

  // Recurring: conflict with blocks sharing at least 1 weekday
  return GradePrograma.findOne({
    where: {
      ...base,
      data: null,
      dias_semana: { [Op.overlap]: diasSemana } as Record<symbol, unknown>,
      [Op.and]: [
        sequelize.where(
          sequelize.literal(`horario_inicio + (
            SELECT duracao_min FROM programas WHERE id = "GradePrograma".programa_id
          ) * interval '1 minute'`),
          { [Op.gt]: ini },
        ),
      ],
    },
  });
}

/* ─── Service ────────────────────────────────────────────────────────────── */

export class GradeProgramasService {
  async findAll(filters: GradeProgramaFilters) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    if (filters.channel_id) where["channel_id"] = filters.channel_id;
    if (filters.ativo !== undefined) where["ativo"] = filters.ativo;

    if (filters.data) {
      // Return: date exceptions matching the date, OR recurring blocks covering that weekday
      const weekday = new Date(filters.data).getDay();
      where[Op.or as unknown as string] = [
        { data: filters.data },
        { data: null, dias_semana: { [Op.contains]: [weekday] } },
      ];
    } else if (filters.dia !== undefined) {
      where["data"] = null;
      where["dias_semana"] = { [Op.contains]: [filters.dia] };
    }

    const { count, rows } = await GradePrograma.findAndCountAll({
      where,
      include: [
        { model: Programa, as: "programa", attributes: ["id", "nome", "duracao_min", "bloco"] },
        { model: Channel, as: "channel", attributes: ["id", "nome"] },
      ],
      order: [["horario_inicio", "ASC"]],
      limit,
      offset,
    });

    return { items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) };
  }

  async findById(id: number) {
    const g = await GradePrograma.findByPk(id, {
      include: [
        { model: Programa, as: "programa" },
        { model: Channel, as: "channel", attributes: ["id", "nome"] },
      ],
    });
    if (!g) throw new HttpError("Grade de programa não encontrada", 404);
    return g;
  }

  async create(dto: CreateGradeProgramaDto) {
    const programa = await Programa.findByPk(dto.programa_id);
    if (!programa) throw new HttpError("Programa não encontrado", 404);

    const channel = await Channel.findByPk(dto.channel_id);
    if (!channel) throw new HttpError("Canal não encontrado", 404);

    const ini = normaliseTime(dto.horario_inicio);
    const fim = addMinutesToTime(ini, programa.duracao_min);
    const isDateSpecific = Boolean(dto.data);
    const diasSemana = dto.dias_semana ?? [0, 1, 2, 3, 4, 5, 6];

    const conflict = await findConflict(
      dto.channel_id,
      dto.programa_id,
      ini,
      fim,
      isDateSpecific,
      dto.data ?? null,
      diasSemana,
    );

    if (conflict) {
      throw new HttpError(
        `Conflito de horário com bloco id=${conflict.id}`,
        409,
        { conflict_with: conflict.id },
      );
    }

    const grade = await GradePrograma.create({
      programa_id: dto.programa_id,
      channel_id: dto.channel_id,
      horario_inicio: ini,
      dias_semana: isDateSpecific ? [0, 1, 2, 3, 4, 5, 6] : diasSemana,
      data: isDateSpecific ? dto.data! : null,
      prioridade: dto.prioridade ?? 0,
      ativo: dto.ativo ?? true,
    } as Parameters<typeof GradePrograma.create>[0]);

    logger.info("GradePrograma created", { id: grade.id, programa_id: dto.programa_id, channel_id: dto.channel_id });
    return grade;
  }

  async update(id: number, dto: UpdateGradeProgramaDto) {
    const grade = await GradePrograma.findByPk(id, {
      include: [{ model: Programa, as: "programa" }],
    });
    if (!grade) throw new HttpError("Grade de programa não encontrada", 404);
    const programa = (grade as GradePrograma & { programa: Programa }).programa;

    if (dto.horario_inicio) {
      const ini = normaliseTime(dto.horario_inicio);
      const fim = addMinutesToTime(ini, programa.duracao_min);
      const isDate = dto.data !== undefined ? Boolean(dto.data) : Boolean(grade.data);
      const diasSemana = dto.dias_semana ?? grade.dias_semana;
      const data = dto.data !== undefined ? dto.data : grade.data;

      const conflict = await findConflict(
        grade.channel_id,
        grade.programa_id,
        ini,
        fim,
        isDate,
        data,
        diasSemana,
        id,
      );
      if (conflict) {
        throw new HttpError(`Conflito de horário com bloco id=${conflict.id}`, 409, { conflict_with: conflict.id });
      }
    }

    await grade.update(dto);
    return grade;
  }

  async remove(id: number) {
    const grade = await GradePrograma.findByPk(id);
    if (!grade) throw new HttpError("Grade de programa não encontrada", 404);
    await grade.destroy();
    return { id };
  }

  async bulk(dtos: CreateGradeProgramaDto[]) {
    return sequelize.transaction(async (t) => {
      const created: GradePrograma[] = [];
      for (const dto of dtos) {
        const g = await this.create(dto);
        created.push(g);
      }
      void t;
      return created;
    });
  }

  /* ── Resolve entire day ─────────────────────────────────────────────── */
  async resolveDay(channelId: number, date: string) {
    const weekday = new Date(date).getDay();

    // Load effective grade for the day: exceptions override recurring
    const exceptions = await GradePrograma.findAll({
      where: { channel_id: channelId, data: date, ativo: true },
      include: [{ model: Programa, as: "programa" }],
      order: [["horario_inicio", "ASC"], ["prioridade", "DESC"]],
    });

    const recurring = await GradePrograma.findAll({
      where: {
        channel_id: channelId,
        data: null,
        ativo: true,
        dias_semana: { [Op.contains]: [weekday] } as Record<symbol, unknown>,
      },
      include: [{ model: Programa, as: "programa" }],
      order: [["horario_inicio", "ASC"], ["prioridade", "DESC"]],
    });

    // Merge: exceptions occupy slots; recurring fill gaps
    const effective: GradePrograma[] = [...exceptions];
    for (const r of recurring) {
      const prog = (r as GradePrograma & { programa: Programa }).programa;
      const rFim = addMinutesToTime(normaliseTime(r.horario_inicio), prog.duracao_min);
      const clashes = effective.some((e) => {
        const ep = (e as GradePrograma & { programa: Programa }).programa;
        const eFim = addMinutesToTime(normaliseTime(e.horario_inicio), ep.duracao_min);
        return normaliseTime(e.horario_inicio) < rFim && eFim > normaliseTime(r.horario_inicio);
      });
      if (!clashes) effective.push(r);
    }

    effective.sort((a, b) => normaliseTime(a.horario_inicio).localeCompare(normaliseTime(b.horario_inicio)));

    // Resolve each block
    const allItems: unknown[] = [];
    for (const block of effective) {
      const prog = (block as GradePrograma & { programa: Programa }).programa;
      const startsAt = `${date}T${normaliseTime(block.horario_inicio)}Z`;
      const resolved = await resolveService.resolve(
        prog.id,
        channelId,
        date,
        startsAt,
      );
      allItems.push(...resolved.items.map((item) => ({
        ...item,
        grade_id: block.id,
        programa_nome: prog.nome,
      })));
    }

    return { date, channel_id: channelId, total_blocks: effective.length, items: allItems };
  }
}

export const gradeProgramasService = new GradeProgramasService();

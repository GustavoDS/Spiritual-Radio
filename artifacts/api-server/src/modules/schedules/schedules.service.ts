import { Op, type WhereOptions } from "sequelize";
import { sequelize, Schedule, Channel } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface CreateScheduleDto {
  channel_id: number;
  horario_inicio: string;
  horario_fim: string;
  tipo: string;
  dias_semana?: number[];
  data?: string | null;
  prioridade?: number;
  ativo?: boolean;
}

export type UpdateScheduleDto = Partial<Omit<CreateScheduleDto, "channel_id">>;

export interface ScheduleFilters {
  channelId?: number;
  date?: string;   // YYYY-MM-DD — filter by effective date
  ativo?: boolean;
  page?: number;
  limit?: number;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Normalise "HH:MM" → "HH:MM:00" so TIME comparisons are consistent. */
function normaliseTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

/**
 * Merge exceptions (date-specific) and recurring blocks for a given day.
 * Exceptions always win over recurring at the same time slot.
 * Among same-type conflicts, higher prioridade wins, then newer id.
 */
function mergeSchedules(exceptions: Schedule[], recurring: Schedule[]): Schedule[] {
  const result: Schedule[] = [...exceptions];

  for (const r of recurring) {
    const hasConflict = result.some(
      (e) => e.horario_inicio < r.horario_fim && e.horario_fim > r.horario_inicio,
    );
    if (!hasConflict) result.push(r);
  }

  result.sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
  return result;
}

/* ─── Overlap detection ──────────────────────────────────────────────────── */

async function findConflict(
  channelId: number,
  horarioInicio: string,
  horarioFim: string,
  isDateSpecific: boolean,
  diasSemana: number[],
  data: string | null,
  excludeId?: number,
): Promise<Schedule | null> {
  const timeOverlap: WhereOptions = {
    horario_inicio: { [Op.lt]: horarioFim },
    horario_fim: { [Op.gt]: horarioInicio },
    ativo: true,
    channel_id: channelId,
  };

  if (excludeId) Object.assign(timeOverlap, { id: { [Op.ne]: excludeId } });

  if (isDateSpecific) {
    // Check conflicts with other date-specific blocks on the same date
    return Schedule.findOne({ where: { ...timeOverlap, data } });
  }

  // Recurring: check other recurring blocks that share at least one day
  return Schedule.findOne({
    where: {
      ...timeOverlap,
      data: null,
      dias_semana: { [Op.overlap]: diasSemana } as unknown as WhereOptions,
    },
  });
}

/* ─── Service ────────────────────────────────────────────────────────────── */

export class SchedulesService {
  /* ── findAll ──────────────────────────────────────────────────────── */

  async findAll(filters: ScheduleFilters = {}) {
    const { channelId, date } = filters;
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 100;
    const offset = (page - 1) * limit;

    // ?date=YYYY-MM-DD  → return effective schedule for that day
    if (date) {
      const targetDate = new Date(`${date}T12:00:00`);
      const weekday = targetDate.getDay(); // 0=Sun…6=Sat

      const baseWhere: WhereOptions = { ativo: true, ...(channelId ? { channel_id: channelId } : {}) };
      const order: [string, string][] = [
        ["horario_inicio", "ASC"],
        ["prioridade", "DESC"],
        ["id", "DESC"],
      ];

      const [exceptions, recurring] = await Promise.all([
        Schedule.findAll({
          where: { ...baseWhere, data: date },
          include: [{ model: Channel, as: "channel", attributes: ["id", "nome"] }],
          order,
        }),
        Schedule.findAll({
          where: {
            ...baseWhere,
            data: null,
            dias_semana: { [Op.contains]: [weekday] } as unknown as WhereOptions,
          },
          include: [{ model: Channel, as: "channel", attributes: ["id", "nome"] }],
          order,
        }),
      ]);

      const items = mergeSchedules(exceptions, recurring);
      return { items, total: items.length, page: 1, limit: items.length, totalPages: 1, date, weekday };
    }

    // No date filter → all schedules (paginated)
    const where: WhereOptions = channelId ? { channel_id: channelId } : {};
    const { count, rows } = await Schedule.findAndCountAll({
      where,
      include: [{ model: Channel, as: "channel", attributes: ["id", "nome"] }],
      order: [["channel_id", "ASC"], ["horario_inicio", "ASC"]],
      limit,
      offset,
    });
    return { items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) };
  }

  /* ── create ───────────────────────────────────────────────────────── */

  async create(dto: CreateScheduleDto): Promise<Schedule> {
    const channel = await Channel.findByPk(dto.channel_id);
    if (!channel) throw new HttpError("Canal não encontrado", 404);

    const inicio = normaliseTime(dto.horario_inicio);
    const fim = normaliseTime(dto.horario_fim);
    if (fim <= inicio) throw new HttpError("horario_fim deve ser maior que horario_inicio", 422);

    const isDateSpecific = !!dto.data;
    const diasSemana = isDateSpecific ? [0, 1, 2, 3, 4, 5, 6] : (dto.dias_semana ?? [0, 1, 2, 3, 4, 5, 6]);
    const data = dto.data ?? null;
    const ativo = dto.ativo ?? true;

    if (ativo) {
      const conflict = await findConflict(
        dto.channel_id, inicio, fim, isDateSpecific, diasSemana, data,
      );
      if (conflict) {
        throw new HttpError(`Conflito de horário com bloco id=${conflict.id}`, 409, { conflict_with: conflict.id });
      }
    }

    return Schedule.create({
      channel_id: dto.channel_id,
      horario_inicio: inicio,
      horario_fim: fim,
      tipo: dto.tipo,
      dias_semana: diasSemana,
      data,
      prioridade: dto.prioridade ?? 0,
      ativo,
    } as unknown as Parameters<typeof Schedule.create>[0]);
  }

  /* ── update ───────────────────────────────────────────────────────── */

  async update(id: number, dto: UpdateScheduleDto): Promise<Schedule> {
    const schedule = await Schedule.findByPk(id);
    if (!schedule) throw new HttpError("Programação não encontrada", 404);

    const inicio = normaliseTime(dto.horario_inicio ?? schedule.horario_inicio);
    const fim = normaliseTime(dto.horario_fim ?? schedule.horario_fim);
    if (fim <= inicio) throw new HttpError("horario_fim deve ser maior que horario_inicio", 422);

    const data = "data" in dto ? (dto.data ?? null) : schedule.data;
    const isDateSpecific = !!data;
    const diasSemana = isDateSpecific
      ? [0, 1, 2, 3, 4, 5, 6]
      : (dto.dias_semana ?? schedule.dias_semana);
    const ativo = dto.ativo ?? schedule.ativo;

    if (ativo) {
      const channelId = schedule.channel_id;
      const conflict = await findConflict(channelId, inicio, fim, isDateSpecific, diasSemana, data, id);
      if (conflict) {
        throw new HttpError(`Conflito de horário com bloco id=${conflict.id}`, 409, { conflict_with: conflict.id });
      }
    }

    await schedule.update({
      horario_inicio: inicio,
      horario_fim: fim,
      ...(dto.tipo !== undefined && { tipo: dto.tipo }),
      dias_semana: diasSemana,
      data,
      ...(dto.prioridade !== undefined && { prioridade: dto.prioridade }),
      ativo,
    });

    return schedule;
  }

  /* ── remove ───────────────────────────────────────────────────────── */

  async remove(id: number): Promise<{ id: number }> {
    const s = await Schedule.findByPk(id);
    if (!s) throw new HttpError("Programação não encontrada", 404);
    await s.destroy();
    return { id };
  }

  /* ── bulk ─────────────────────────────────────────────────────────── */

  async bulk(items: CreateScheduleDto[]): Promise<{ created: Schedule[]; errors: { index: number; message: string }[] }> {
    const created: Schedule[] = [];
    const errors: { index: number; message: string }[] = [];

    await sequelize.transaction(async (t) => {
      for (let i = 0; i < items.length; i++) {
        try {
          const dto = items[i]!;
          const channel = await Channel.findByPk(dto.channel_id, { transaction: t });
          if (!channel) throw new Error(`Canal ${dto.channel_id} não encontrado`);

          const inicio = normaliseTime(dto.horario_inicio);
          const fim = normaliseTime(dto.horario_fim);
          if (fim <= inicio) throw new Error("horario_fim deve ser maior que horario_inicio");

          const isDateSpecific = !!dto.data;
          const diasSemana = isDateSpecific ? [0, 1, 2, 3, 4, 5, 6] : (dto.dias_semana ?? [0, 1, 2, 3, 4, 5, 6]);
          const data = dto.data ?? null;
          const ativo = dto.ativo ?? true;

          if (ativo) {
            const conflict = await findConflict(dto.channel_id, inicio, fim, isDateSpecific, diasSemana, data);
            if (conflict) throw new Error(`Conflito de horário com bloco id=${conflict.id}`);
          }

          const s = await Schedule.create({
            channel_id: dto.channel_id,
            horario_inicio: inicio,
            horario_fim: fim,
            tipo: dto.tipo,
            dias_semana: diasSemana,
            data,
            prioridade: dto.prioridade ?? 0,
            ativo,
          } as unknown as Parameters<typeof Schedule.create>[0], { transaction: t });

          created.push(s);
        } catch (err) {
          errors.push({ index: i, message: err instanceof Error ? err.message : String(err) });
          throw err; // rollback entire transaction
        }
      }
    }).catch(() => {
      // errors already collected; created[] was in the rolled-back transaction
      created.length = 0;
    });

    return { created, errors };
  }

  /* ── duplicate ────────────────────────────────────────────────────── */

  async duplicate(id: number, overrides: Partial<CreateScheduleDto> = {}): Promise<Schedule> {
    const original = await Schedule.findByPk(id);
    if (!original) throw new HttpError("Programação não encontrada", 404);

    const dto: CreateScheduleDto = {
      channel_id: overrides.channel_id ?? original.channel_id,
      horario_inicio: overrides.horario_inicio ?? original.horario_inicio,
      horario_fim: overrides.horario_fim ?? original.horario_fim,
      tipo: overrides.tipo ?? original.tipo,
      dias_semana: overrides.dias_semana ?? original.dias_semana,
      data: "data" in overrides ? (overrides.data ?? null) : original.data,
      prioridade: overrides.prioridade ?? original.prioridade,
      ativo: overrides.ativo ?? original.ativo,
    };

    return this.create(dto);
  }
}

export const schedulesService = new SchedulesService();

import { Op } from "sequelize";
import { sequelize, GradePrograma, Programa, Channel, Content, DayBlockItem, Vinheta } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { resolveService } from "../../services/ResolveService.js";
import type { ResolvedItem } from "../../services/ResolveService.js";
import { vinhetasService } from "../vinhetas/vinhetas.service.js";
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

/**
 * Per-block result returned by `resolveDay()`.
 * Includes block metadata so callers (e.g. PlaylistMaterializationService)
 * can loop content to fill the full `duracao_min` window.
 */
export interface ResolveDayBlock {
  grade_id: number;
  programa_id: number;
  programa_nome: string;
  /** programa.bloco — the named time-of-day slot */
  programa_bloco: string;
  /** "HH:MM:SS" (server-local = UTC on Replit) */
  horario_inicio: string;
  /** ISO UTC: "${date}T${horario_inicio}Z" */
  horario_inicio_iso: string;
  /** "HH:MM:SS" — wraps midnight correctly */
  horario_fim: string;
  duracao_min: number;
  /** Total seconds of content resolved (may be < duracao_min*60 if pool is small) */
  duracao_real_sec: number;
  /** true when duracao_real_sec < duracao_min * 60 * 0.9 — content pool too thin */
  under_filled: boolean;
  /** Number of items resolved per content tipo (e.g. { musica: 12, oracao: 4 }) */
  counts: Record<string, number>;
  /** Warnings for empty/thin pools or invalid tipos in the receita */
  pool_warnings: string[];
  items: import("../../services/ResolveService.js").ResolvedItem[];
}

/** Shape returned by `getPublicDaySchedule()` — what the frontend schedule shows. */
export interface PublicScheduleItem {
  id: number;
  horario_inicio: string;
  horario_fim: string;
  /** programa.bloco */
  tipo: string;
  /** programa.nome */
  title: string;
  description: string | null;
  duracao_min: number;
}

/* ─── Time helpers ───────────────────────────────────────────────────────── */

function normaliseTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

/** Maps "HH:MM:SS" → BlocoVinheta name (mirrors PlaylistMaterializationService). */
function blocoFromHoraStr(horaStr: string): string {
  const h = parseInt(horaStr.split(":")[0] ?? "0", 10);
  if (h < 5)  return "madrugada";
  if (h < 7)  return "amanhecer";
  if (h < 12) return "manha";
  if (h < 14) return "almoco";
  if (h < 18) return "tarde";
  if (h < 21) return "prime";
  if (h < 23) return "noite";
  return "sleep";
}

/** Maps content.tipo → the "antes_de_X" vinheta tipo, or null if not applicable. */
function beforeTipoVinheta(contentTipo: string): string | null {
  if (contentTipo === "oracao") return "antes_de_oracao";
  if (["mensagem", "pregacao", "devocional", "reflexao"].includes(contentTipo)) return "antes_de_mensagem";
  if (contentTipo === "versiculo") return "antes_de_versiculo";
  return null;
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

  /* ── Private: merge + sort effective blocks for a day ───────────────── */

  /**
   * Returns the ordered, de-duplicated list of active GradePrograma entries
   * for `channelId` on `date`. Exception entries (data = date) take priority
   * over recurring (data = null). Uses UTC day-of-week to avoid TZ drift.
   */
  private async _getEffectiveBlocks(channelId: number, date: string): Promise<GradePrograma[]> {
    // Parse date as UTC to avoid local-timezone weekday drift (e.g. UTC-3 server)
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

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
    return effective;
  }

  /* ── Private: build ResolveDayBlock from persisted DayBlockItem rows ── */

  /**
   * Reconstructs a `ResolveDayBlock` from rows already in `day_block_items`.
   * Batch-loads the associated Content rows so the full `content` sub-object
   * is available — same shape as the live-resolved path.
   */
  private async _buildBlockFromDayBlockItems(
    items: InstanceType<typeof DayBlockItem>[],
    block: GradePrograma,
    prog: Programa,
    date: string,
  ): Promise<ResolveDayBlock> {
    // Batch-load content records
    const contentIds = [
      ...new Set(
        items.map((i) => i.content_id).filter((id): id is number => id != null).map(Number),
      ),
    ];
    const contentsRaw =
      contentIds.length > 0
        ? await Content.findAll({
            where: { id: { [Op.in]: contentIds } },
            attributes: ["id", "titulo", "tipo", "audio_url", "mixed_audio_url", "imagem_url", "duracao"],
          })
        : [];
    // Normalize keys to Number: Sequelize BIGINT columns return strings at runtime,
    // but content_id fields on DayBlockItem can be numbers — use Number() on both
    // sides to guarantee Map.get() hits regardless of which type Sequelize chose.
    const contentMap = new Map(contentsRaw.map((c) => [Number(c.id), c]));

    // Batch-load vinheta records (for tipo='vinheta' rows)
    const vinhetaIds = [
      ...new Set(
        items
          .map((i) => (i as InstanceType<typeof DayBlockItem> & { vinheta_id?: number | null }).vinheta_id)
          .filter((id): id is number => id != null)
          .map(Number),
      ),
    ];
    const vinhetasRaw =
      vinhetaIds.length > 0
        ? await Vinheta.findAll({
            where: { id: { [Op.in]: vinhetaIds } },
            attributes: ["id", "nome", "audio_url", "duracao_sec"],
          })
        : [];
    const vinhetaMap = new Map(vinhetasRaw.map((v) => [Number(v.id), v]));

    const blockStartMs = new Date(`${date}T${normaliseTime(block.horario_inicio)}Z`).getTime();
    let elapsed = 0;
    let duracao_real_sec = 0;
    const counts: Record<string, number> = {};

    const resolvedItems: ResolvedItem[] = items.map((item) => {
      const startsAtIso = new Date(blockStartMs + elapsed * 1000).toISOString();
      elapsed += item.duracao_sec;
      duracao_real_sec += item.duracao_sec;
      counts[item.tipo] = (counts[item.tipo] ?? 0) + 1;

      const itemVinhetaId = (item as InstanceType<typeof DayBlockItem> & { vinheta_id?: number | null }).vinheta_id;
      const content = item.content_id != null ? (contentMap.get(Number(item.content_id)) ?? null) : null;
      const vinheta = itemVinhetaId != null ? (vinhetaMap.get(Number(itemVinhetaId)) ?? null) : null;

      // Audio URL priority: content mixed > content raw > vinheta audio > null
      const audioUrl: string | null = content
        ? ((content as Content & { mixed_audio_url?: string | null }).mixed_audio_url ?? content.audio_url ?? null)
        : (vinheta?.audio_url ?? null);

      const titulo: string | null = content?.titulo ?? vinheta?.nome ?? null;

      return {
        id: item.id,
        ordem: item.ordem,
        content_id: item.content_id ?? null,
        vinheta_id: itemVinhetaId ?? null,
        titulo,
        tipo: item.tipo,
        duration_sec: item.duracao_sec,
        duracao_sec: item.duracao_sec,
        starts_at: startsAtIso,
        audio_url: audioUrl,
        content: content
          ? {
              id: content.id,
              titulo: content.titulo,
              tipo: content.tipo,
              audio_url: audioUrl,
              imagem_url:
                (content as Content & { imagem_url?: string | null }).imagem_url ?? null,
              duracao: content.duracao,
            }
          : null,
      };
    });

    const duracaoEsperadaSec = prog.duracao_min * 60;
    return {
      grade_id: block.id,
      programa_id: prog.id,
      programa_nome: prog.nome,
      programa_bloco: prog.bloco,
      horario_inicio: normaliseTime(block.horario_inicio),
      horario_inicio_iso: `${date}T${normaliseTime(block.horario_inicio)}Z`,
      horario_fim: addMinutesToTime(normaliseTime(block.horario_inicio), prog.duracao_min),
      duracao_min: prog.duracao_min,
      duracao_real_sec,
      under_filled: duracao_real_sec < duracaoEsperadaSec * 0.9,
      counts,
      pool_warnings: [],
      items: resolvedItems,
    };
  }

  /* ── Resolve entire day ─────────────────────────────────────────────── */

  /**
   * Resolves all program blocks for a channel/date.
   *
   * **DB-first (deterministic)**: if `day_block_items` rows already exist for
   * a given (date, channel_id, grade_id) tuple the lottery is skipped and the
   * persisted items are returned verbatim.  On first call for a day+channel,
   * the lottery runs and the result is saved to `day_block_items` with
   * `source='auto'` so subsequent calls are identical.
   *
   * Returns both a flat `items` list (backward-compat) and a `blocks` array
   * with per-block metadata needed by PlaylistMaterializationService.
   */
  async resolveDay(channelId: number, date: string) {
    const effective = await this._getEffectiveBlocks(channelId, date);

    const allItems: unknown[] = [];
    const blockResults: ResolveDayBlock[] = [];

    for (const block of effective) {
      const prog = (block as GradePrograma & { programa: Programa }).programa;
      const startsAt = `${date}T${normaliseTime(block.horario_inicio)}Z`;

      // ── 1. Try to load from persistent cache ──────────────────────────
      const existing = await DayBlockItem.findAll({
        where: { date, channel_id: channelId, grade_id: block.id },
        order: [["ordem", "ASC"]],
      });

      let blockResult: ResolveDayBlock;

      if (existing.length > 0) {
        // DB hit — deterministic path
        blockResult = await this._buildBlockFromDayBlockItems(existing, block, prog, date);
        logger.debug("resolveDay: cache hit", {
          channelId, date, grade_id: block.id, items: existing.length,
        });
      } else {
        // ── 2. Cache miss — run the lottery ────────────────────────────
        const resolved = await resolveService.resolve(prog.id, channelId, date, startsAt);

        // ── 3. Persist to day_block_items with vinheta injection ───────
        //
        // Build the row list interleaved with:
        //   • abertura vinheta at block start
        //   • antes_de_X before oração/mensagem/versículo/etc
        //   • encerramento vinheta at block end
        //
        // This makes the full sequence editable by admins (PUT /bulk).
        // Batch-load usa_vinheta_automatica to respect per-content overrides.

        const bloco = blocoFromHoraStr(normaliseTime(block.horario_inicio));

        const allContentIds = [...new Set(
          resolved.items.map((i) => i.content_id).filter((id): id is number => id != null),
        )];
        const contentMetaRaw = allContentIds.length > 0
          ? await Content.findAll({
              where: { id: { [Op.in]: allContentIds } },
              attributes: ["id", "usa_vinheta_automatica"],
            })
          : [];
        const usaVinhetaMap = new Map(
          contentMetaRaw.map((c) => [
            Number(c.id),
            (c as Content & { usa_vinheta_automatica?: boolean }).usa_vinheta_automatica ?? true,
          ]),
        );

        type DayRow = {
          date: string;
          channel_id: number | null;
          grade_id: number;
          programa_id: number;
          ordem: number;
          tipo: string;
          content_id: number | null;
          vinheta_id: number | null;
          duracao_sec: number;
          source: "auto";
        };

        const rows: DayRow[] = [];
        let ordem = 0;

        const tryPushVinheta = async (tipoV: string): Promise<void> => {
          const v = await vinhetasService.pickVinheta(channelId, bloco, tipoV).catch(() => null);
          if (!v?.audio_url) return;
          rows.push({
            date,
            channel_id: channelId,
            grade_id: block.id,
            programa_id: prog.id,
            ordem: ordem++,
            tipo: "vinheta",
            content_id: null,
            vinheta_id: v.id,
            duracao_sec: v.duracao_sec ?? 30,
            source: "auto",
          });
        };

        // Abertura
        await tryPushVinheta("abertura");

        // Content items with antes_de_X
        for (const item of resolved.items) {
          const usaVinheta = item.content_id != null
            ? (usaVinhetaMap.get(item.content_id) ?? true)
            : false;

          if (usaVinheta && item.tipo !== "musica") {
            const tipoV = beforeTipoVinheta(item.tipo);
            if (tipoV) await tryPushVinheta(tipoV);
          }

          rows.push({
            date,
            channel_id: channelId,
            grade_id: block.id,
            programa_id: prog.id,
            ordem: ordem++,
            tipo: item.tipo,
            content_id: item.content_id ?? null,
            vinheta_id: null,
            duracao_sec: item.duration_sec,
            source: "auto",
          });
        }

        // Encerramento
        await tryPushVinheta("encerramento");

        let created: InstanceType<typeof DayBlockItem>[] = [];
        if (rows.length > 0) {
          try {
            created = await DayBlockItem.bulkCreate(
              rows as Parameters<typeof DayBlockItem.bulkCreate>[0],
              { returning: true },
            ) as InstanceType<typeof DayBlockItem>[];
            logger.info("resolveDay: materialized to day_block_items", {
              channelId, date, grade_id: block.id,
              items: created.length,
              vinhetas: rows.filter((r) => r.tipo === "vinheta").length,
              duracao_total_sec: rows.reduce((acc, r) => acc + r.duracao_sec, 0),
            });
          } catch (err) {
            // Non-fatal: concurrent materializations can cause unique-key conflicts.
            // Fall back to the pure-lottery result (no vinhetas in response).
            logger.warn("resolveDay: bulkCreate day_block_items failed (race?)", {
              channelId, date, grade_id: block.id,
              err: (err as Error).message,
            });
          }
        }

        if (created.length > 0) {
          // Use _buildBlockFromDayBlockItems so the response includes vinheta data
          // and is identical in shape to a cache-hit response.
          blockResult = await this._buildBlockFromDayBlockItems(created, block, prog, date);
        } else {
          // Fallback: build from resolved items without vinhetas
          const duracaoEsperadaSec = prog.duracao_min * 60;
          blockResult = {
            grade_id: block.id,
            programa_id: prog.id,
            programa_nome: prog.nome,
            programa_bloco: prog.bloco,
            horario_inicio: normaliseTime(block.horario_inicio),
            horario_inicio_iso: startsAt,
            horario_fim: addMinutesToTime(normaliseTime(block.horario_inicio), prog.duracao_min),
            duracao_min: prog.duracao_min,
            duracao_real_sec: resolved.duracao_real_sec,
            under_filled: resolved.duracao_real_sec < duracaoEsperadaSec * 0.9,
            counts: resolved.counts,
            pool_warnings: resolved.pool_warnings,
            items: resolved.items,
          };
        }
      }

      allItems.push(
        ...blockResult.items.map((item) => ({
          ...item,
          grade_id: block.id,
          programa_nome: prog.nome,
        })),
      );
      blockResults.push(blockResult);
    }

    return {
      date,
      channel_id: channelId,
      total_blocks: effective.length,
      blocks: blockResults,
      items: allItems,
    };
  }

  /* ── Public schedule (for front-end display) ─────────────────────────── */

  /**
   * Returns the effective day schedule for a channel in the public format
   * expected by the frontend: real program names, bloco as tipo, horario_fim.
   * Uses grade_programas + programas — replaces the legacy schedules table.
   */
  async getPublicDaySchedule(channelId: number, date: string): Promise<PublicScheduleItem[]> {
    const effective = await this._getEffectiveBlocks(channelId, date);
    return effective.map((block) => {
      const prog = (block as GradePrograma & { programa: Programa }).programa;
      const inicio = normaliseTime(block.horario_inicio);
      const fim = addMinutesToTime(inicio, prog.duracao_min);
      return {
        id: block.id,
        horario_inicio: inicio,
        horario_fim: fim,
        tipo: prog.bloco,
        title: prog.nome,
        description: prog.descricao ?? null,
        duracao_min: prog.duracao_min,
      };
    });
  }
}

export const gradeProgramasService = new GradeProgramasService();

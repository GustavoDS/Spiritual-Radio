import { Op, type WhereOptions } from "sequelize";
import { Schedule, Channel, Playlist } from "../models/index.js";
import { logger } from "../lib/logger.js";

/* ─── Public types ───────────────────────────────────────────────────────── */

export interface CurrentScheduleItem {
  schedule: Schedule;
  channel?: Channel | null;
}

/* ─── Merge helper ───────────────────────────────────────────────────────── */

/**
 * Merge date-specific exceptions and recurring weekly blocks for a given day.
 * Exceptions always win over recurring at the same time slot.
 * Remaining conflicts (exception vs exception, recurring vs recurring) are
 * resolved by prioridade DESC then id DESC — the input arrays must already be
 * ordered that way so the first item found for a slot wins.
 */
function mergeSchedules(exceptions: Schedule[], recurring: Schedule[]): Schedule[] {
  const result: Schedule[] = [...exceptions];

  for (const r of recurring) {
    const conflicts = result.some(
      (e) => e.horario_inicio < r.horario_fim && e.horario_fim > r.horario_inicio,
    );
    if (!conflicts) result.push(r);
  }

  result.sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
  return result;
}

/* ─── ScheduleService ────────────────────────────────────────────────────── */

export class ScheduleService {
  /**
   * Return all active Schedule blocks effective for a given date.
   * Exceptions (data = date) take precedence over recurring (dias_semana).
   */
  async findSchedulesForDate(date: string, channelId?: number): Promise<Schedule[]> {
    const targetDate = new Date(`${date}T12:00:00`);
    const weekday = targetDate.getDay(); // 0=Sun … 6=Sat

    const base: WhereOptions = { ativo: true, ...(channelId ? { channel_id: channelId } : {}) };
    const order: [string, string][] = [
      ["horario_inicio", "ASC"],
      ["prioridade", "DESC"],
      ["id", "DESC"],
    ];

    const [exceptions, recurring] = await Promise.all([
      Schedule.findAll({
        where: { ...base, data: date },
        include: [{ model: Channel, as: "channel" }],
        order,
      }),
      Schedule.findAll({
        where: {
          ...base,
          data: null,
          dias_semana: { [Op.contains]: [weekday] } as unknown as WhereOptions,
        },
        include: [{ model: Channel, as: "channel" }],
        order,
      }),
    ]);

    return mergeSchedules(exceptions, recurring);
  }

  /** Blocks active for today. */
  async getTodaySchedule(channelId?: number): Promise<Schedule[]> {
    const today = new Date().toISOString().split("T")[0]!;
    return this.findSchedulesForDate(today, channelId);
  }

  /** Currently live block (horario_inicio ≤ now ≤ horario_fim). */
  async getCurrentSchedule(channelId?: number): Promise<Schedule[]> {
    const now = new Date();
    const timeStr = [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join(":");
    const today = now.toISOString().split("T")[0]!;

    const all = await this.findSchedulesForDate(today, channelId);
    return all.filter((s) => s.horario_inicio <= timeStr && s.horario_fim >= timeStr);
  }

  /** Next upcoming block after now. */
  async getNextSlot(channelId: number): Promise<Schedule | null> {
    const now = new Date();
    const timeStr = [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join(":");
    const today = now.toISOString().split("T")[0]!;

    const all = await this.findSchedulesForDate(today, channelId);
    return all.find((s) => s.horario_inicio > timeStr) ?? null;
  }

  async createPlaylistForToday(channelId: number): Promise<Playlist> {
    const today = new Date().toISOString().split("T")[0]!;
    const [playlist] = await Playlist.findOrCreate({
      where: { channel_id: channelId, data: today },
      defaults: { channel_id: channelId, data: today },
    });
    logger.info("Playlist created/found for today", { channelId, today });
    return playlist;
  }
}

export const scheduleService = new ScheduleService();

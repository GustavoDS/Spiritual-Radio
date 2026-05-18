import { Op } from "sequelize";
import { Schedule, Content, Channel, Playlist } from "../models/index.js";
import { logger } from "../lib/logger.js";

export interface CurrentScheduleItem {
  schedule: Schedule;
  content?: Content | null;
  channel?: Channel | null;
}

export class ScheduleService {
  async getCurrentSchedule(channelId?: number): Promise<Schedule[]> {
    const now = new Date();
    const where: Record<string, unknown> = {
      horario_inicio: { [Op.lte]: now },
      horario_fim: { [Op.gte]: now },
    };
    if (channelId) where["channel_id"] = channelId;

    return Schedule.findAll({
      where,
      include: [{ model: Channel, as: "channel" }],
      order: [["horario_inicio", "ASC"]],
    });
  }

  async getTodaySchedule(channelId?: number): Promise<Schedule[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const where: Record<string, unknown> = {
      horario_inicio: { [Op.between]: [start, end] },
    };
    if (channelId) where["channel_id"] = channelId;

    return Schedule.findAll({
      where,
      include: [{ model: Channel, as: "channel" }],
      order: [["horario_inicio", "ASC"]],
    });
  }

  async getNextSlot(channelId: number): Promise<Schedule | null> {
    const now = new Date();
    return Schedule.findOne({
      where: { channel_id: channelId, horario_inicio: { [Op.gt]: now } },
      order: [["horario_inicio", "ASC"]],
      include: [{ model: Channel, as: "channel" }],
    });
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

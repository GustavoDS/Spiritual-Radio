import { Schedule, Channel } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { scheduleService as svc } from "../../services/ScheduleService.js";

export interface CreateScheduleDto {
  channel_id: number;
  horario_inicio: string;
  horario_fim: string;
  tipo: string;
}

export class SchedulesService {
  async findAll(channelId?: number, data?: string) {
    if (data) {
      const start = new Date(data);
      const end = new Date(data);
      end.setHours(23, 59, 59, 999);
      const { Op } = await import("sequelize");
      const where: Record<string, unknown> = {
        horario_inicio: { [Op.between]: [start, end] },
      };
      if (channelId) where["channel_id"] = channelId;
      return Schedule.findAll({
        where,
        include: [{ model: Channel, as: "channel", attributes: ["id", "nome"] }],
        order: [["horario_inicio", "ASC"]],
      });
    }
    return svc.getTodaySchedule(channelId);
  }

  async create(dto: CreateScheduleDto) {
    const channel = await Channel.findByPk(dto.channel_id);
    if (!channel) throw new HttpError("Canal não encontrado", 404);
    return Schedule.create({
      ...dto,
      horario_inicio: new Date(dto.horario_inicio),
      horario_fim: new Date(dto.horario_fim),
    });
  }

  async remove(id: number) {
    const s = await Schedule.findByPk(id);
    if (!s) throw new HttpError("Programação não encontrada", 404);
    await s.destroy();
    return { id };
  }
}

export const schedulesService = new SchedulesService();

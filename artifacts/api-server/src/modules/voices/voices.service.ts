import { Voice } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";

export interface CreateVoiceDto {
  nome: string;
  voice_id_externo?: string;
  provider: string;
  horario_preferencial?: string;
  ativo?: boolean;
}

export interface VoiceFilters {
  page?: number;
  limit?: number;
  includeInactive?: boolean;
}

export class VoicesService {
  async findAll(filters: VoiceFilters = {}) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;
    const where = filters.includeInactive ? {} : { ativo: true };
    const { count, rows } = await Voice.findAndCountAll({
      where,
      order: [["nome", "ASC"]],
      limit,
      offset,
    });
    return { items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) };
  }

  async findById(id: number) {
    const voice = await Voice.findByPk(id);
    if (!voice) throw new HttpError("Voz não encontrada", 404);
    return voice;
  }

  async create(dto: CreateVoiceDto) {
    return Voice.create(dto as unknown as Parameters<typeof Voice.create>[0]);
  }

  async update(id: number, dto: Partial<CreateVoiceDto>) {
    const voice = await Voice.findByPk(id);
    if (!voice) throw new HttpError("Voz não encontrada", 404);
    await voice.update(dto);
    return voice;
  }

  async remove(id: number) {
    const voice = await Voice.findByPk(id);
    if (!voice) throw new HttpError("Voz não encontrada", 404);
    await voice.destroy();
    return { id };
  }
}

export const voicesService = new VoicesService();

import { Voice } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";

export interface CreateVoiceDto {
  nome: string;
  provider: string;
  horario_preferencial?: string;
}

export class VoicesService {
  async findAll() {
    return Voice.findAll({ where: { ativo: true }, order: [["nome", "ASC"]] });
  }

  async findById(id: number) {
    const voice = await Voice.findByPk(id);
    if (!voice) throw new HttpError("Voz não encontrada", 404);
    return voice;
  }

  async create(dto: CreateVoiceDto) {
    return Voice.create(dto as unknown as Parameters<typeof Voice.create>[0]);
  }

  async update(id: number, dto: Partial<CreateVoiceDto & { ativo: boolean }>) {
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

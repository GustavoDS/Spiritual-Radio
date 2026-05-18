import { Channel } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";

export interface CreateChannelDto {
  nome: string;
  descricao?: string;
  ativo?: boolean;
}

export class ChannelsService {
  async findAll() {
    return Channel.findAll({ order: [["nome", "ASC"]] });
  }

  async findById(id: number) {
    const channel = await Channel.findByPk(id);
    if (!channel) throw new HttpError("Canal não encontrado", 404);
    return channel;
  }

  async create(dto: CreateChannelDto) {
    return Channel.create(dto as unknown as Parameters<typeof Channel.create>[0]);
  }

  async update(id: number, dto: Partial<CreateChannelDto>) {
    const channel = await Channel.findByPk(id);
    if (!channel) throw new HttpError("Canal não encontrado", 404);
    await channel.update(dto);
    return channel;
  }

  async remove(id: number) {
    const channel = await Channel.findByPk(id);
    if (!channel) throw new HttpError("Canal não encontrado", 404);
    await channel.destroy();
    return { id };
  }
}

export const channelsService = new ChannelsService();

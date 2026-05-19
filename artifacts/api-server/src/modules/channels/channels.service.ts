import { Channel } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";

export interface CreateChannelDto {
  nome: string;
  descricao?: string;
  ativo?: boolean;
}

export interface ChannelFilters {
  page?: number;
  limit?: number;
}

export class ChannelsService {
  async findAll(filters: ChannelFilters = {}) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;
    const { count, rows } = await Channel.findAndCountAll({
      order: [["nome", "ASC"]],
      limit,
      offset,
    });
    return { items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) };
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

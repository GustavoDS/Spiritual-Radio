import { Op, type WhereOptions } from "sequelize";
import { ContactMessage, type ContactTipo, type ContactStatus, type ContactPrioridade } from "../../models/ContactMessage.js";
import { User } from "../../models/User.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import type { ContactInput, PrayerRequestInput, ListMessagesQuery } from "./messages.validators.js";

export class MessageService {
  async createContact(
    data: ContactInput,
    ip: string | null,
    userAgent: string | null,
  ): Promise<ContactMessage> {
    return ContactMessage.create({
      nome: data.nome,
      email: data.email ?? null,
      telefone: data.telefone ?? null,
      assunto: data.assunto,
      mensagem: data.mensagem,
      tipo: data.tipo as ContactTipo,
      status: "novo",
      prioridade: "normal",
      canal_origem: data.canal_origem ?? null,
      ip,
      user_agent: userAgent,
    });
  }

  async createPrayerRequest(
    data: PrayerRequestInput,
    ip: string | null,
    userAgent: string | null,
  ): Promise<ContactMessage> {
    return ContactMessage.create({
      nome: data.nome,
      email: data.email ?? null,
      telefone: data.telefone ?? null,
      assunto: "Pedido de Oração",
      mensagem: data.mensagem,
      tipo: "pedido_oracao" as ContactTipo,
      status: "novo",
      prioridade: data.prioridade as ContactPrioridade,
      canal_origem: data.canal_origem ?? null,
      ip,
      user_agent: userAgent,
    });
  }

  async findAll(query: ListMessagesQuery): Promise<{ rows: ContactMessage[]; count: number }> {
    const where: WhereOptions = {};

    if (query.status) (where as Record<string, unknown>)["status"] = query.status;
    if (query.tipo) (where as Record<string, unknown>)["tipo"] = query.tipo;
    if (query.prioridade) (where as Record<string, unknown>)["prioridade"] = query.prioridade;

    if (query.desde ?? query.ate) {
      const dateRange: Record<symbol, unknown> = {};
      if (query.desde) dateRange[Op.gte] = new Date(query.desde);
      if (query.ate) dateRange[Op.lte] = new Date(`${query.ate}T23:59:59`);
      (where as Record<string, unknown>)["createdAt"] = dateRange;
    }

    if (query.q) {
      (where as Record<string, unknown>)[Op.or as unknown as string] = [
        { nome: { [Op.iLike]: `%${query.q}%` } },
        { assunto: { [Op.iLike]: `%${query.q}%` } },
        { mensagem: { [Op.iLike]: `%${query.q}%` } },
      ];
    }

    const offset = (query.page - 1) * query.limit;

    return ContactMessage.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "respondente",
          attributes: ["id", "nome", "email"],
          required: false,
        },
      ],
      order: [
        ["status", "ASC"],
        ["createdAt", "DESC"],
      ],
      limit: query.limit,
      offset,
    });
  }

  async findById(id: number): Promise<ContactMessage> {
    const msg = await ContactMessage.findByPk(id, {
      include: [
        {
          model: User,
          as: "respondente",
          attributes: ["id", "nome", "email"],
          required: false,
        },
      ],
    });
    if (!msg) throw new HttpError("Mensagem não encontrada", 404);

    if (!msg.lido_em) {
      await msg.update({ lido_em: new Date() });
    }

    return msg;
  }

  async updateStatus(id: number, status: ContactStatus): Promise<ContactMessage> {
    const msg = await ContactMessage.findByPk(id);
    if (!msg) throw new HttpError("Mensagem não encontrada", 404);
    await msg.update({ status });
    return msg;
  }

  async respond(id: number, resposta: string, userId: number): Promise<ContactMessage> {
    const msg = await ContactMessage.findByPk(id);
    if (!msg) throw new HttpError("Mensagem não encontrada", 404);
    await msg.update({
      resposta_admin: resposta,
      respondido_por: userId,
      respondido_em: new Date(),
      status: "respondido" as ContactStatus,
    });
    return msg;
  }

  async updatePriority(id: number, prioridade: ContactPrioridade): Promise<ContactMessage> {
    const msg = await ContactMessage.findByPk(id);
    if (!msg) throw new HttpError("Mensagem não encontrada", 404);
    await msg.update({ prioridade });
    return msg;
  }

  async countUnread(): Promise<number> {
    return ContactMessage.count({ where: { lido_em: null } });
  }

  async remove(id: number): Promise<void> {
    const msg = await ContactMessage.findByPk(id);
    if (!msg) throw new HttpError("Mensagem não encontrada", 404);
    await msg.destroy();
  }

  async getStats(): Promise<Record<string, unknown>> {
    const [total, novas, pedidosOracao, respondidas, pendentes, porTipo, por7dias] =
      await Promise.all([
        ContactMessage.count(),
        ContactMessage.count({ where: { status: "novo" } }),
        ContactMessage.count({ where: { tipo: "pedido_oracao" } }),
        ContactMessage.count({ where: { status: "respondido" } }),
        ContactMessage.count({ where: { status: ["novo", "em_analise"] } }),
        ContactMessage.findAll({
          attributes: [
            "tipo",
            [ContactMessage.sequelize!.fn("COUNT", ContactMessage.sequelize!.col("id")), "total"],
          ],
          group: ["tipo"],
          raw: true,
        }),
        ContactMessage.count({
          where: {
            createdAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        }),
      ]);

    return {
      total,
      novas,
      pedidosOracao,
      respondidas,
      pendentes,
      ultimos7dias: por7dias,
      porTipo,
    };
  }
}

export const messageService = new MessageService();

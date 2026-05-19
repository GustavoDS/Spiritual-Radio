import { Model, DataTypes, type Sequelize } from "sequelize";

export type ContactTipo = "contato" | "pedido_oracao" | "testemunho" | "sugestao";
export type ContactStatus = "novo" | "em_analise" | "respondido" | "arquivado";
export type ContactPrioridade = "baixa" | "normal" | "alta" | "urgente";

export class ContactMessage extends Model {
  declare id: number;
  declare nome: string;
  declare email: string | null;
  declare telefone: string | null;
  declare assunto: string;
  declare mensagem: string;
  declare tipo: ContactTipo;
  declare status: ContactStatus;
  declare prioridade: ContactPrioridade;
  declare canal_origem: string | null;
  declare ip: string | null;
  declare user_agent: string | null;
  declare resposta_admin: string | null;
  declare respondido_por: number | null;
  declare respondido_em: Date | null;
  declare lido_em: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initContactMessage(sequelize: Sequelize): void {
  ContactMessage.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nome: { type: DataTypes.STRING(255), allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: true },
      telefone: { type: DataTypes.STRING(50), allowNull: true },
      assunto: { type: DataTypes.STRING(255), allowNull: false },
      mensagem: { type: DataTypes.TEXT, allowNull: false },
      tipo: {
        type: DataTypes.ENUM("contato", "pedido_oracao", "testemunho", "sugestao"),
        allowNull: false,
        defaultValue: "contato",
      },
      status: {
        type: DataTypes.ENUM("novo", "em_analise", "respondido", "arquivado"),
        allowNull: false,
        defaultValue: "novo",
      },
      prioridade: {
        type: DataTypes.ENUM("baixa", "normal", "alta", "urgente"),
        allowNull: false,
        defaultValue: "normal",
      },
      canal_origem: { type: DataTypes.STRING(100), allowNull: true },
      ip: { type: DataTypes.STRING(45), allowNull: true },
      user_agent: { type: DataTypes.STRING(500), allowNull: true },
      resposta_admin: { type: DataTypes.TEXT, allowNull: true },
      respondido_por: { type: DataTypes.INTEGER, allowNull: true },
      respondido_em: { type: DataTypes.DATE, allowNull: true },
      lido_em: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: "ContactMessage",
      tableName: "contact_messages",
      timestamps: true,
    },
  );
}

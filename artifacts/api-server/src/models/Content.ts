import { Model, DataTypes, type Sequelize } from "sequelize";

export class Content extends Model {
  declare id: number;
  declare titulo: string;
  declare tipo: string;
  declare categoria_id: number | null;
  declare audio_url: string | null;
  declare mixed_audio_url: string | null;
  declare background_track_id: string | null;
  declare imagem_url: string | null;
  declare duracao: number | null;
  declare tags: string[];
  declare ativo: boolean;
  declare channel_id: number | null;
  declare usa_vinheta_automatica: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initContent(sequelize: Sequelize): void {
  Content.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      titulo: { type: DataTypes.STRING(500), allowNull: false },
      tipo: { type: DataTypes.STRING(100), allowNull: false },
      categoria_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: "categories", key: "id" } },
      audio_url: { type: DataTypes.TEXT, allowNull: true },
      mixed_audio_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Pre-rendered mix of voice + background track. Used by HLS stream in place of audio_url when set.",
      },
      background_track_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "Fixed background track for this item. If null, a random track from the category is used.",
      },
      imagem_url: { type: DataTypes.TEXT, allowNull: true },
      duracao: { type: DataTypes.INTEGER, allowNull: true, comment: "Duração em segundos" },
      tags: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [], allowNull: false },
      ativo: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },
      channel_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: "channels", key: "id" } },
      usa_vinheta_automatica: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "Se true, vinhetas são injetadas automaticamente antes deste conteúdo. Use false para músicas ou conteúdos com intro embutida.",
      },
    },
    {
      sequelize,
      modelName: "Content",
      tableName: "contents",
      timestamps: true,
      indexes: [
        { fields: ["channel_id"] },
        { fields: ["categoria_id"] },
        { fields: ["ativo"] },
        { fields: ["tipo"] },
      ],
    },
  );
}

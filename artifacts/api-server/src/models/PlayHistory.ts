import { Model, DataTypes, type Sequelize } from "sequelize";

export class PlayHistory extends Model {
  declare id: number;
  declare content_id: number;
  declare channel_id: number;
  declare played_at: Date;
  declare programa_id: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initPlayHistory(sequelize: Sequelize): void {
  PlayHistory.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      content_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "contents", key: "id" },
      },
      channel_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "channels", key: "id" },
      },
      played_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      programa_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        references: { model: "programas", key: "id" },
      },
    },
    {
      sequelize,
      modelName: "PlayHistory",
      tableName: "play_history",
      timestamps: true,
      indexes: [
        { fields: ["channel_id", "content_id", "played_at"] },
        { fields: ["channel_id", "played_at"] },
        { fields: ["programa_id"] },
      ],
    },
  );
}

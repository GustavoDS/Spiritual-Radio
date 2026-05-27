import { Model, DataTypes, type Sequelize } from "sequelize";

export class ContentChannel extends Model {
  declare content_id: number;
  declare channel_id: number;
  declare created_at: Date;
}

export function initContentChannel(sequelize: Sequelize): void {
  ContentChannel.init(
    {
      content_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
      channel_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: "ContentChannel",
      tableName: "content_channels",
      timestamps: false,
    },
  );
}

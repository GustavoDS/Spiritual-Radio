import { Model, DataTypes, type Sequelize } from "sequelize";

export class VinhetaChannel extends Model {
  declare vinheta_id: number;
  declare channel_id: number;
  declare created_at: Date;
}

export function initVinhetaChannel(sequelize: Sequelize): void {
  VinhetaChannel.init(
    {
      vinheta_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
      channel_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: "VinhetaChannel",
      tableName: "vinheta_channels",
      timestamps: false,
    },
  );
}

import { Model, DataTypes, type Sequelize, type CreationOptional } from "sequelize";

export class VinhetaExecucao extends Model {
  declare id: CreationOptional<number>;
  declare vinheta_id: number;
  declare channel_id: number | null;
  declare executada_em: CreationOptional<Date>;
}

export function initVinhetaExecucao(sequelize: Sequelize): void {
  VinhetaExecucao.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      vinheta_id: { type: DataTypes.INTEGER, allowNull: false },
      channel_id: { type: DataTypes.INTEGER, allowNull: true },
      executada_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: "VinhetaExecucao",
      tableName: "vinheta_execucoes",
      timestamps: false,
      indexes: [
        { fields: ["vinheta_id", "channel_id", "executada_em"] },
      ],
    },
  );
}

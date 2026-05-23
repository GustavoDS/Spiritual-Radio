import { Model, DataTypes, type Sequelize } from "sequelize";

export class Channel extends Model {
  declare id: number;
  declare nome: string;
  declare descricao: string | null;
  declare ativo: boolean;
  declare usa_programas: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initChannel(sequelize: Sequelize): void {
  Channel.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nome: { type: DataTypes.STRING(255), allowNull: false },
      descricao: { type: DataTypes.TEXT, allowNull: true },
      ativo: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },
      usa_programas: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: "When true, AutoDJ uses grade_programas instead of schedules",
      },
    },
    { sequelize, modelName: "Channel", tableName: "channels", timestamps: true },
  );
}

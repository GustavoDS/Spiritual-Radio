import { Model, DataTypes, type Sequelize } from "sequelize";

export class Schedule extends Model {
  declare id: number;
  declare channel_id: number;
  declare horario_inicio: Date;
  declare horario_fim: Date;
  declare tipo: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initSchedule(sequelize: Sequelize): void {
  Schedule.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      channel_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "channels", key: "id" },
      },
      horario_inicio: { type: DataTypes.DATE, allowNull: false },
      horario_fim: { type: DataTypes.DATE, allowNull: false },
      tipo: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Ex: devocional, louvor, pregacao, meditacao",
      },
    },
    { sequelize, modelName: "Schedule", tableName: "schedules", timestamps: true },
  );
}

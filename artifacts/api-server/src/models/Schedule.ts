import { Model, DataTypes, type Sequelize } from "sequelize";

export class Schedule extends Model {
  declare id: number;
  declare channel_id: number;
  declare horario_inicio: string;   // "HH:MM:SS" (TIME)
  declare horario_fim: string;      // "HH:MM:SS" (TIME)
  declare tipo: string;
  declare dias_semana: number[];    // 0=Dom … 6=Sáb; default all days
  declare data: string | null;      // "YYYY-MM-DD"; when set, ignores dias_semana
  declare prioridade: number;       // higher = wins in conflicts
  declare ativo: boolean;
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
      horario_inicio: {
        type: DataTypes.TIME,
        allowNull: false,
        comment: "HH:MM:SS — start of the broadcast block",
      },
      horario_fim: {
        type: DataTypes.TIME,
        allowNull: false,
        comment: "HH:MM:SS — end of the broadcast block (must be > horario_inicio)",
      },
      tipo: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Ex: devocional, louvor, pregacao, meditacao",
      },
      dias_semana: {
        type: DataTypes.ARRAY(DataTypes.INTEGER),
        allowNull: false,
        defaultValue: [0, 1, 2, 3, 4, 5, 6],
        comment: "0=Dom … 6=Sáb. Ignored when data is set.",
      },
      data: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        defaultValue: null,
        comment: "YYYY-MM-DD — when set, block applies only on this date (exception/special)",
      },
      prioridade: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Higher wins when two blocks conflict at the same time slot",
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "Soft-disable without deleting",
      },
    },
    {
      sequelize,
      modelName: "Schedule",
      tableName: "schedules",
      timestamps: true,
      indexes: [
        { fields: ["channel_id"] },
        { fields: ["horario_inicio"] },
        { fields: ["channel_id", "horario_inicio"] },
        { fields: ["channel_id", "data"] },
        { fields: ["ativo"] },
      ],
    },
  );
}

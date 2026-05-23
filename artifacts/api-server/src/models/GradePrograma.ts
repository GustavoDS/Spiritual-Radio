import { Model, DataTypes, type Sequelize } from "sequelize";

export class GradePrograma extends Model {
  declare id: number;
  declare programa_id: number;
  declare channel_id: number;
  declare horario_inicio: string;    // "HH:MM:SS" TIME
  declare dias_semana: number[];     // 0=Dom … 6=Sáb; ignored when data is set
  declare data: string | null;       // "YYYY-MM-DD" date exception
  declare prioridade: number;
  declare ativo: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initGradePrograma(sequelize: Sequelize): void {
  GradePrograma.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      programa_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "programas", key: "id" },
      },
      channel_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "channels", key: "id" },
      },
      horario_inicio: {
        type: DataTypes.TIME,
        allowNull: false,
        comment: "HH:MM — hour the program block starts",
      },
      dias_semana: {
        type: DataTypes.ARRAY(DataTypes.INTEGER),
        allowNull: false,
        defaultValue: [0, 1, 2, 3, 4, 5, 6],
        comment: "0=Dom…6=Sáb. Ignored when data is set.",
      },
      data: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        defaultValue: null,
        comment: "YYYY-MM-DD date exception — overrides dias_semana",
      },
      prioridade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      sequelize,
      modelName: "GradePrograma",
      tableName: "grade_programas",
      timestamps: true,
      indexes: [
        { fields: ["channel_id"] },
        { fields: ["programa_id"] },
        { fields: ["channel_id", "data"] },
        { fields: ["ativo"] },
      ],
    },
  );
}

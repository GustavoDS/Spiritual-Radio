import { Model, DataTypes, type Sequelize } from "sequelize";

export type TimePeriod =
  | "madrugada"
  | "morning"
  | "afternoon"
  | "evening"
  | "night"
  | "sunday"
  | "holiday"
  | "special";

export class AutomationRule extends Model {
  declare id: number;
  declare channel_id: number | null;
  declare period: TimePeriod;
  declare enabled: boolean;
  declare content_types: string[];
  declare topics: string[];
  declare voice_style: string;
  declare min_duration_sec: number;
  declare max_duration_sec: number;
  declare generation_limit: number;
  declare cooldown_hours: number;
  declare auto_generate: boolean;
  declare auto_publish: boolean;
  declare tts_enabled: boolean;
  declare priority_level: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initAutomationRule(sequelize: Sequelize): void {
  AutomationRule.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      channel_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        references: { model: "channels", key: "id" },
      },
      period: {
        type: DataTypes.ENUM(
          "madrugada",
          "morning",
          "afternoon",
          "evening",
          "night",
          "sunday",
          "holiday",
          "special",
        ),
        allowNull: false,
      },
      enabled: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },
      content_types: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: ["devocional"],
      },
      topics: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: [],
      },
      voice_style: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "calm",
      },
      min_duration_sec: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 60,
      },
      max_duration_sec: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 300,
      },
      generation_limit: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
        comment: "Máximo de conteúdos gerados por execução",
      },
      cooldown_hours: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 4,
        comment: "Horas mínimas antes de repetir o mesmo conteúdo",
      },
      auto_generate: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      auto_publish: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      tts_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      priority_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5,
        comment: "1 (baixa) a 10 (urgente)",
      },
    },
    {
      sequelize,
      modelName: "AutomationRule",
      tableName: "automation_rules",
      timestamps: true,
      indexes: [
        { fields: ["period"] },
        { fields: ["channel_id"] },
        { fields: ["enabled"] },
        { unique: true, fields: ["channel_id", "period"], where: { channel_id: { [Symbol.for("ne")]: null } } },
      ],
    },
  );
}

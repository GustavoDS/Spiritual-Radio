import { DataTypes, Model, type Sequelize, type InferAttributes, type InferCreationAttributes, type CreationOptional } from "sequelize";

export type AiEventType = "ai_generation" | "tts_synthesis";

export class AiEvent extends Model<
  InferAttributes<AiEvent>,
  InferCreationAttributes<AiEvent>
> {
  declare id: CreationOptional<number>;
  declare event_type: AiEventType;
  declare provider: string;
  declare model: CreationOptional<string | null>;
  declare chars_in: number;
  declare tokens_est: CreationOptional<number | null>;
  declare cost_usd_est: CreationOptional<number | null>;
  declare duration_ms: number;
  declare success: boolean;
  declare error: CreationOptional<string | null>;
  declare content_id: CreationOptional<number | null>;
  declare audio_duration_sec: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
}

export function initAiEvent(sequelize: Sequelize): void {
  AiEvent.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      event_type: {
        type: DataTypes.ENUM("ai_generation", "tts_synthesis"),
        allowNull: false,
      },
      provider: { type: DataTypes.STRING(64), allowNull: false },
      model: { type: DataTypes.STRING(128), allowNull: true },
      chars_in: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      tokens_est: { type: DataTypes.INTEGER, allowNull: true },
      cost_usd_est: { type: DataTypes.FLOAT, allowNull: true },
      duration_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      success: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      error: { type: DataTypes.TEXT, allowNull: true },
      content_id: { type: DataTypes.INTEGER, allowNull: true },
      audio_duration_sec: { type: DataTypes.FLOAT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: "ai_events",
      timestamps: false,
      indexes: [
        { fields: ["event_type"] },
        { fields: ["provider"] },
        { fields: ["success"] },
        { fields: ["createdAt"] },
        { fields: ["content_id"] },
      ],
    },
  );
}

import { Model, DataTypes, type Sequelize } from "sequelize";

export type AutomationStatus =
  | "started"
  | "running"
  | "completed"
  | "failed"
  | "partial";

export type AutomationTrigger =
  | "scheduler"
  | "manual"
  | "gap_fill"
  | "fallback";

export class AutomationLog extends Model {
  declare id: number;
  declare run_id: string;
  declare channel_id: number | null;
  declare period: string;
  declare triggered_by: AutomationTrigger;
  declare status: AutomationStatus;
  declare contents_generated: number;
  declare contents_failed: number;
  declare cost_usd_est: number;
  declare duration_ms: number | null;
  declare error: string | null;
  declare metadata: Record<string, unknown> | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initAutomationLog(sequelize: Sequelize): void {
  AutomationLog.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      run_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: "UUID de agrupamento de execução",
      },
      channel_id: { type: DataTypes.INTEGER, allowNull: true },
      period: { type: DataTypes.STRING(30), allowNull: false },
      triggered_by: {
        type: DataTypes.ENUM("scheduler", "manual", "gap_fill", "fallback"),
        allowNull: false,
        defaultValue: "scheduler",
      },
      status: {
        type: DataTypes.ENUM("started", "running", "completed", "failed", "partial"),
        allowNull: false,
        defaultValue: "started",
      },
      contents_generated: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      contents_failed: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      cost_usd_est: {
        type: DataTypes.DECIMAL(12, 8),
        allowNull: false,
        defaultValue: 0,
      },
      duration_ms: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      error: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      sequelize,
      modelName: "AutomationLog",
      tableName: "automation_logs",
      timestamps: true,
      indexes: [
        { fields: ["run_id"] },
        { fields: ["channel_id"] },
        { fields: ["period"] },
        { fields: ["status"] },
        { fields: ["triggered_by"] },
        { fields: ["createdAt"] },
      ],
    },
  );
}

import { Model, DataTypes, type Sequelize } from "sequelize";

/**
 * Persistent materialization of a resolved program block for a specific date.
 *
 * The first call to POST /grade-programas/resolve-day runs the lottery
 * (ResolveService) and stores the result here.  Subsequent calls read from
 * this table, making the day's content list deterministic and editable by admins.
 *
 * Vinhetas are NOT stored here — they are injected by PlaylistMaterializationService
 * from the `vinhetas` table at playlist-build time.
 */
export class DayBlockItem extends Model {
  declare id: number;
  /** YYYY-MM-DD */
  declare date: string;
  declare channel_id: number | null;
  /** FK → grade_programas.id (CASCADE DELETE) */
  declare grade_id: number;
  /** FK → programas.id */
  declare programa_id: number;
  /** 0-based position within the block */
  declare ordem: number;
  /** Content type: musica, oracao, mensagem, reflexao, versiculo, … */
  declare tipo: string;
  /** FK → contents.id (SET NULL on content deletion) */
  declare content_id: number | null;
  declare duracao_sec: number;
  /** 'auto' = lottery result; 'manual' = admin edit */
  declare source: "auto" | "manual";
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initDayBlockItem(sequelize: Sequelize): void {
  DayBlockItem.init(
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: "YYYY-MM-DD — the calendar day this block belongs to",
      },
      channel_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "channels", key: "id" },
        onDelete: "CASCADE",
      },
      grade_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "grade_programas", key: "id" },
        onDelete: "CASCADE",
      },
      programa_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "programas", key: "id" },
      },
      ordem: { type: DataTypes.INTEGER, allowNull: false, comment: "0-based order within the block" },
      tipo: { type: DataTypes.STRING(40), allowNull: false },
      content_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: "contents", key: "id" },
        onDelete: "SET NULL",
      },
      duracao_sec: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "auto",
        validate: { isIn: [["auto", "manual"]] },
      },
    },
    {
      sequelize,
      modelName: "DayBlockItem",
      tableName: "day_block_items",
      timestamps: true,
      // Indexes are managed exclusively by migration 31/32 — do NOT define
      // them here. Sequelize auto-sync does not manage indexes on existing
      // tables (alter:true only touches columns), so duplicating them here
      // would only create conflicting indexes on fresh databases via sync().
      indexes: [],
    },
  );
}

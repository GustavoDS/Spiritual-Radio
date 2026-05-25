import { Model, DataTypes, type Sequelize } from "sequelize";

export class BackgroundTrackSettings extends Model {
  declare content_type: string;   // primary key
  declare enabled: boolean;
  declare volume_base: number;    // 0..1
  declare ducking_db: number;     // e.g. -18
  declare fade_in_ms: number;
  declare fade_out_ms: number;
  declare default_category: string | null;
}

export function initBackgroundTrackSettings(sequelize: Sequelize): void {
  BackgroundTrackSettings.init(
    {
      content_type: {
        type: DataTypes.STRING(100),
        primaryKey: true,
        comment: "oracao | reflexao | mensagem",
      },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      volume_base: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0.25,
        comment: "Background track volume 0..1",
      },
      ducking_db: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: -18,
        comment: "Approximate ducking depth in dB (controls sidechain ratio)",
      },
      fade_in_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1500 },
      fade_out_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2000 },
      default_category: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Default track category to draw from when no track is fixed on the content",
      },
    },
    {
      sequelize,
      modelName: "BackgroundTrackSettings",
      tableName: "background_track_settings",
      timestamps: false,
    },
  );
}

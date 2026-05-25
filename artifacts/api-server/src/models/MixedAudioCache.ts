import { Model, DataTypes, type Sequelize } from "sequelize";

export class MixedAudioCache extends Model {
  declare id: number;
  declare hash: string;        // sha256 of mix params
  declare url: string;         // public URL of the mixed file in storage
  declare duration_sec: number | null;
  declare createdAt: Date;
}

export function initMixedAudioCache(sequelize: Sequelize): void {
  MixedAudioCache.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: "SHA-256 of voice_url + track_id + mix settings",
      },
      url: { type: DataTypes.TEXT, allowNull: false },
      duration_sec: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      sequelize,
      modelName: "MixedAudioCache",
      tableName: "mixed_audio_cache",
      timestamps: true,
      updatedAt: false,
    },
  );
}

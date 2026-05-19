import { Model, DataTypes, type Sequelize } from "sequelize";

export class PlaylistItem extends Model {
  declare id: number;
  declare playlist_id: number;
  declare content_id: number | null;
  declare ordem: number;
  declare hora_execucao: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initPlaylistItem(sequelize: Sequelize): void {
  PlaylistItem.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      playlist_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "playlists", key: "id" },
      },
      content_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "contents", key: "id" },
      },
      ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      hora_execucao: {
        type: DataTypes.TIME,
        allowNull: true,
        comment: "Horário de execução HH:MM:SS",
      },
    },
    {
      sequelize,
      modelName: "PlaylistItem",
      tableName: "playlist_items",
      timestamps: true,
      indexes: [
        { fields: ["playlist_id"] },
        { fields: ["content_id"] },
        { fields: ["hora_execucao"] },
      ],
    },
  );
}

import { Model, DataTypes, type Sequelize } from "sequelize";

export class Playlist extends Model {
  declare id: number;
  declare channel_id: number;
  declare data: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initPlaylist(sequelize: Sequelize): void {
  Playlist.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      channel_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "channels", key: "id" },
      },
      data: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: "Data da playlist (YYYY-MM-DD)",
      },
    },
    { sequelize, modelName: "Playlist", tableName: "playlists", timestamps: true },
  );
}

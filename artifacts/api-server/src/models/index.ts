import { sequelize } from "../config/database.js";
import { User, initUser } from "./User.js";
import { Channel, initChannel } from "./Channel.js";
import { Category, initCategory } from "./Category.js";
import { Content, initContent } from "./Content.js";
import { Voice, initVoice } from "./Voice.js";
import { Schedule, initSchedule } from "./Schedule.js";
import { Playlist, initPlaylist } from "./Playlist.js";
import { PlaylistItem, initPlaylistItem } from "./PlaylistItem.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

initUser(sequelize);
initChannel(sequelize);
initCategory(sequelize);
initContent(sequelize);
initVoice(sequelize);
initSchedule(sequelize);
initPlaylist(sequelize);
initPlaylistItem(sequelize);

Content.belongsTo(Category, { foreignKey: "categoria_id", as: "categoria", onDelete: "SET NULL" });
Category.hasMany(Content, { foreignKey: "categoria_id", as: "contents" });

Content.belongsTo(Channel, { foreignKey: "channel_id", as: "channel", onDelete: "SET NULL" });
Channel.hasMany(Content, { foreignKey: "channel_id", as: "contents" });

Schedule.belongsTo(Channel, { foreignKey: "channel_id", as: "channel" });
Channel.hasMany(Schedule, { foreignKey: "channel_id", as: "schedules" });

Playlist.belongsTo(Channel, { foreignKey: "channel_id", as: "channel" });
Channel.hasMany(Playlist, { foreignKey: "channel_id", as: "playlists" });

PlaylistItem.belongsTo(Playlist, { foreignKey: "playlist_id", as: "playlist", onDelete: "CASCADE" });
Playlist.hasMany(PlaylistItem, { foreignKey: "playlist_id", as: "items" });

PlaylistItem.belongsTo(Content, { foreignKey: "content_id", as: "content", onDelete: "SET NULL" });
Content.hasMany(PlaylistItem, { foreignKey: "content_id", as: "playlistItems" });

export async function syncDatabase(force = false): Promise<void> {
  if (env.nodeEnv === "production" && !env.syncDb) {
    logger.info("Production mode: skipping auto-sync — run migrations manually");
    return;
  }
  await sequelize.sync({ force, alter: !force });
}

export { sequelize, User, Channel, Category, Content, Voice, Schedule, Playlist, PlaylistItem };

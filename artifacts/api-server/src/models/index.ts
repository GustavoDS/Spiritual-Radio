import { sequelize } from "../config/database.js";
import { User, initUser } from "./User.js";
import { Channel, initChannel } from "./Channel.js";
import { Category, initCategory } from "./Category.js";
import { Content, initContent } from "./Content.js";
import { Voice, initVoice } from "./Voice.js";
import { Schedule, initSchedule } from "./Schedule.js";
import { Playlist, initPlaylist } from "./Playlist.js";

initUser(sequelize);
initChannel(sequelize);
initCategory(sequelize);
initContent(sequelize);
initVoice(sequelize);
initSchedule(sequelize);
initPlaylist(sequelize);

Content.belongsTo(Category, { foreignKey: "categoria_id", as: "categoria" });
Category.hasMany(Content, { foreignKey: "categoria_id", as: "contents" });

Content.belongsTo(Channel, { foreignKey: "channel_id", as: "channel" });
Channel.hasMany(Content, { foreignKey: "channel_id", as: "contents" });

Schedule.belongsTo(Channel, { foreignKey: "channel_id", as: "channel" });
Channel.hasMany(Schedule, { foreignKey: "channel_id", as: "schedules" });

Playlist.belongsTo(Channel, { foreignKey: "channel_id", as: "channel" });
Channel.hasMany(Playlist, { foreignKey: "channel_id", as: "playlists" });

export async function syncDatabase(force = false): Promise<void> {
  await sequelize.sync({ force, alter: !force });
}

export { sequelize, User, Channel, Category, Content, Voice, Schedule, Playlist };

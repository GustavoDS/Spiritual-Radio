import { sequelize } from "../config/database.js";
import { User, initUser } from "./User.js";
import { Channel, initChannel } from "./Channel.js";
import { Category, initCategory } from "./Category.js";
import { Content, initContent } from "./Content.js";
import { Voice, initVoice } from "./Voice.js";
import { Schedule, initSchedule } from "./Schedule.js";
import { Playlist, initPlaylist } from "./Playlist.js";
import { PlaylistItem, initPlaylistItem } from "./PlaylistItem.js";
import { ContactMessage, initContactMessage } from "./ContactMessage.js";
import { RadioPlay, initRadioPlay } from "./RadioPlay.js";
import { AiEvent, initAiEvent } from "./AiEvent.js";
import { AutomationRule, initAutomationRule } from "./AutomationRule.js";
import { AutomationLog, initAutomationLog } from "./AutomationLog.js";
import { Programa, initPrograma } from "./Programa.js";
import { GradePrograma, initGradePrograma } from "./GradePrograma.js";
import { PlayHistory, initPlayHistory } from "./PlayHistory.js";
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
initContactMessage(sequelize);
initRadioPlay(sequelize);
initAiEvent(sequelize);
initAutomationRule(sequelize);
initAutomationLog(sequelize);
initPrograma(sequelize);
initGradePrograma(sequelize);
initPlayHistory(sequelize);

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

ContactMessage.belongsTo(User, { foreignKey: "respondido_por", as: "respondente", onDelete: "SET NULL" });
User.hasMany(ContactMessage, { foreignKey: "respondido_por", as: "respostas" });

// Programas
Programa.belongsTo(Channel, { foreignKey: "channel_id", as: "channel", onDelete: "SET NULL" });
Channel.hasMany(Programa, { foreignKey: "channel_id", as: "programas" });

// Grade Programas
GradePrograma.belongsTo(Programa, { foreignKey: "programa_id", as: "programa", onDelete: "CASCADE" });
Programa.hasMany(GradePrograma, { foreignKey: "programa_id", as: "grade" });

GradePrograma.belongsTo(Channel, { foreignKey: "channel_id", as: "channel" });
Channel.hasMany(GradePrograma, { foreignKey: "channel_id", as: "gradeProgramas" });

// Play History
PlayHistory.belongsTo(Content, { foreignKey: "content_id", as: "content", onDelete: "CASCADE" });
Content.hasMany(PlayHistory, { foreignKey: "content_id", as: "playHistory" });

PlayHistory.belongsTo(Channel, { foreignKey: "channel_id", as: "channel" });
Channel.hasMany(PlayHistory, { foreignKey: "channel_id", as: "playHistory" });

PlayHistory.belongsTo(Programa, { foreignKey: "programa_id", as: "programa", onDelete: "SET NULL" });
Programa.hasMany(PlayHistory, { foreignKey: "programa_id", as: "playHistory" });

export async function syncDatabase(force = false): Promise<void> {
  if (env.nodeEnv === "production" && !env.syncDb) {
    logger.info("Production mode: skipping auto-sync — run migrations manually");
    return;
  }

  if (env.nodeEnv === "production") {
    // In production only CREATE missing tables — never ALTER existing ones.
    // Sequelize's alter:true generates invalid FK syntax on pre-existing columns
    // (e.g. ALTER COLUMN … SET DEFAULT NULL REFERENCES …) which PostgreSQL rejects.
    // Schema changes on existing tables must be handled with explicit migrations.
    await sequelize.sync({ force: false, alter: false });
    logger.info("Production sync complete: missing tables created (alter skipped)");
    return;
  }

  await sequelize.sync({ force, alter: !force });
}

export {
  sequelize,
  User, Channel, Category, Content, Voice,
  Schedule, Playlist, PlaylistItem,
  ContactMessage, RadioPlay, AiEvent,
  AutomationRule, AutomationLog,
  Programa, GradePrograma, PlayHistory,
};

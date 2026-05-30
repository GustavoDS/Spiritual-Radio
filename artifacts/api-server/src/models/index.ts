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
import { BackgroundTrack, initBackgroundTrack } from "./BackgroundTrack.js";
import { BackgroundTrackSettings, initBackgroundTrackSettings } from "./BackgroundTrackSettings.js";
import { MixedAudioCache, initMixedAudioCache } from "./MixedAudioCache.js";
import { Vinheta, initVinheta } from "./Vinheta.js";
import { VinhetaExecucao, initVinhetaExecucao } from "./VinhetaExecucao.js";
import { ContentChannel, initContentChannel } from "./ContentChannel.js";
import { VinhetaChannel, initVinhetaChannel } from "./VinhetaChannel.js";
import { DayBlockItem, initDayBlockItem } from "./DayBlockItem.js";
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
initBackgroundTrack(sequelize);
initBackgroundTrackSettings(sequelize);
initMixedAudioCache(sequelize);
initVinheta(sequelize);
initVinhetaExecucao(sequelize);
initContentChannel(sequelize);
initVinhetaChannel(sequelize);
initDayBlockItem(sequelize);

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

/**
 * Sync a single model's table, swallowing errors so one bad model never blocks others.
 */
async function syncModel(model: { sync: (opts: object) => Promise<unknown>; name?: string }, opts: object): Promise<void> {
  try {
    await model.sync(opts);
  } catch (err) {
    logger.warn(`syncDatabase: failed to sync model ${(model as { name?: string }).name ?? "?"}`, {
      err: (err as Error).message,
    });
  }
}

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

  // Dev: best-effort alter sync — some existing tables may fail ALTER (FK syntax bug in Sequelize+PG).
  // We catch the top-level error and then individually ensure new/critical tables exist.
  try {
    await sequelize.sync({ force, alter: !force });
  } catch (err) {
    logger.warn("syncDatabase: global alter-sync had errors — ensuring individual tables", {
      err: (err as Error).message,
    });
  }

  // Always create new tables that may have been missed by the global sync.
  const createOnly = { force: false, alter: false };
  await Promise.all([
    syncModel(BackgroundTrack, createOnly),
    syncModel(BackgroundTrackSettings, createOnly),
    syncModel(MixedAudioCache, createOnly),
    syncModel(Vinheta, createOnly),
    syncModel(VinhetaExecucao, createOnly),
    syncModel(DayBlockItem, createOnly),
  ]);
  logger.info("syncDatabase: new tables ensured (background-tracks + vinhetas + day_block_items)");
}

// BackgroundTrack FK on Content (optional, no cascade delete — track deletion clears cache manually)
Content.belongsTo(BackgroundTrack, { foreignKey: "background_track_id", as: "backgroundTrack", onDelete: "SET NULL", constraints: false });
BackgroundTrack.hasMany(Content, { foreignKey: "background_track_id", as: "contents", constraints: false });

// Vinhetas (legacy 1:N kept for compat)
Vinheta.belongsTo(Channel, { foreignKey: "channel_id", as: "channel", onDelete: "CASCADE" });
Channel.hasMany(Vinheta, { foreignKey: "channel_id", as: "vinhetas" });

// Content ↔ Channel  N:N
Content.belongsToMany(Channel, { through: ContentChannel, as: "channels", foreignKey: "content_id", otherKey: "channel_id" });
Channel.belongsToMany(Content, { through: ContentChannel, as: "channelContents", foreignKey: "channel_id", otherKey: "content_id" });

// Vinheta ↔ Channel  N:N
Vinheta.belongsToMany(Channel, { through: VinhetaChannel, as: "channels", foreignKey: "vinheta_id", otherKey: "channel_id" });
Channel.belongsToMany(Vinheta, { through: VinhetaChannel, as: "channelVinhetas", foreignKey: "channel_id", otherKey: "vinheta_id" });

VinhetaExecucao.belongsTo(Vinheta, { foreignKey: "vinheta_id", as: "vinheta", onDelete: "CASCADE" });
Vinheta.hasMany(VinhetaExecucao, { foreignKey: "vinheta_id", as: "execucoes" });

// Vinheta ↔ BackgroundTrack (bed musical)
Vinheta.belongsTo(BackgroundTrack, { foreignKey: "background_track_id", as: "background_track", constraints: false });
BackgroundTrack.hasMany(Vinheta, { foreignKey: "background_track_id", as: "vinhetas_com_bed", constraints: false });

// DayBlockItem associations
DayBlockItem.belongsTo(Channel, { foreignKey: "channel_id", as: "channel", onDelete: "CASCADE" });
Channel.hasMany(DayBlockItem, { foreignKey: "channel_id", as: "dayBlockItems" });

DayBlockItem.belongsTo(GradePrograma, { foreignKey: "grade_id", as: "grade", onDelete: "CASCADE" });
GradePrograma.hasMany(DayBlockItem, { foreignKey: "grade_id", as: "dayBlockItems" });

DayBlockItem.belongsTo(Programa, { foreignKey: "programa_id", as: "programa" });
Programa.hasMany(DayBlockItem, { foreignKey: "programa_id", as: "dayBlockItems" });

DayBlockItem.belongsTo(Content, { foreignKey: "content_id", as: "content", onDelete: "SET NULL" });
Content.hasMany(DayBlockItem, { foreignKey: "content_id", as: "dayBlockItems" });

DayBlockItem.belongsTo(Vinheta, { foreignKey: "vinheta_id", as: "vinheta", constraints: false });
Vinheta.hasMany(DayBlockItem, { foreignKey: "vinheta_id", as: "vinhetaDayBlockItems" });

export {
  sequelize,
  User, Channel, Category, Content, Voice,
  Schedule, Playlist, PlaylistItem,
  ContactMessage, RadioPlay, AiEvent,
  ContentChannel, VinhetaChannel,
  AutomationRule, AutomationLog,
  Programa, GradePrograma, PlayHistory,
  BackgroundTrack, BackgroundTrackSettings, MixedAudioCache,
  Vinheta, VinhetaExecucao,
  DayBlockItem,
};

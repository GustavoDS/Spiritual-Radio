import { Umzug, SequelizeStorage } from "umzug";
import { DataTypes, type QueryInterface } from "sequelize";
import { sequelize } from "../config/database.js";
import { logger } from "../lib/logger.js";

type Ctx = { context: QueryInterface };

const migrations = [
  {
    name: "01-create-users",
    async up({ context: qi }: Ctx) {
      await qi.createTable("users", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        nome: { type: DataTypes.STRING(255), allowNull: false },
        email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        senha: { type: DataTypes.STRING(255), allowNull: false },
        role: { type: DataTypes.ENUM("admin", "user", "editor"), defaultValue: "user", allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("users"); },
  },
  {
    name: "02-create-channels",
    async up({ context: qi }: Ctx) {
      await qi.createTable("channels", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        nome: { type: DataTypes.STRING(255), allowNull: false },
        descricao: { type: DataTypes.TEXT, allowNull: true },
        ativo: { type: DataTypes.BOOLEAN, defaultValue: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("channels"); },
  },
  {
    name: "03-create-categories",
    async up({ context: qi }: Ctx) {
      await qi.createTable("categories", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        nome: { type: DataTypes.STRING(255), allowNull: false, unique: true },
        descricao: { type: DataTypes.TEXT, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("categories"); },
  },
  {
    name: "04-create-contents",
    async up({ context: qi }: Ctx) {
      await qi.createTable("contents", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        titulo: { type: DataTypes.STRING(500), allowNull: false },
        tipo: { type: DataTypes.STRING(100), allowNull: false },
        categoria_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: "categories", key: "id" }, onDelete: "SET NULL" },
        channel_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: "channels", key: "id" }, onDelete: "SET NULL" },
        audio_url: { type: DataTypes.TEXT, allowNull: true },
        imagem_url: { type: DataTypes.TEXT, allowNull: true },
        duracao: { type: DataTypes.INTEGER, allowNull: true },
        tags: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
        ativo: { type: DataTypes.BOOLEAN, defaultValue: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
      await qi.addIndex("contents", ["channel_id"]);
      await qi.addIndex("contents", ["categoria_id"]);
      await qi.addIndex("contents", ["ativo"]);
      await qi.addIndex("contents", ["tipo"]);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("contents"); },
  },
  {
    name: "05-create-voices",
    async up({ context: qi }: Ctx) {
      await qi.createTable("voices", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        nome: { type: DataTypes.STRING(255), allowNull: false },
        provider: { type: DataTypes.STRING(100), allowNull: false },
        horario_preferencial: { type: DataTypes.STRING(50), allowNull: true },
        ativo: { type: DataTypes.BOOLEAN, defaultValue: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
      await qi.addIndex("voices", ["provider"]);
      await qi.addIndex("voices", ["horario_preferencial"]);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("voices"); },
  },
  {
    name: "06-create-schedules",
    async up({ context: qi }: Ctx) {
      await qi.createTable("schedules", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        channel_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: "channels", key: "id" }, onDelete: "CASCADE" },
        horario_inicio: { type: DataTypes.DATE, allowNull: false },
        horario_fim: { type: DataTypes.DATE, allowNull: false },
        tipo: { type: DataTypes.STRING(100), allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
      await qi.addIndex("schedules", ["channel_id"]);
      await qi.addIndex("schedules", ["horario_inicio"]);
      await qi.addIndex("schedules", ["channel_id", "horario_inicio"]);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("schedules"); },
  },
  {
    name: "07-create-playlists",
    async up({ context: qi }: Ctx) {
      await qi.createTable("playlists", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        channel_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: "channels", key: "id" }, onDelete: "CASCADE" },
        data: { type: DataTypes.DATEONLY, allowNull: false },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
      await qi.addIndex("playlists", ["channel_id"]);
      await qi.addIndex("playlists", ["data"]);
      await qi.addIndex("playlists", ["channel_id", "data"], { unique: true });
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("playlists"); },
  },
  {
    name: "08-create-playlist-items",
    async up({ context: qi }: Ctx) {
      await qi.createTable("playlist_items", {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        playlist_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: "playlists", key: "id" }, onDelete: "CASCADE" },
        content_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: "contents", key: "id" }, onDelete: "SET NULL" },
        ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        hora_execucao: { type: DataTypes.TIME, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
      await qi.addIndex("playlist_items", ["playlist_id"]);
      await qi.addIndex("playlist_items", ["content_id"]);
      await qi.addIndex("playlist_items", ["hora_execucao"]);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("playlist_items"); },
  },
];

export const umzug = new Umzug({
  migrations,
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: {
    info: (m) => logger.info(String(m)),
    warn: (m) => logger.warn(String(m)),
    error: (m) => logger.error(String(m)),
    debug: (m) => logger.debug(String(m)),
  },
});

export async function runMigrations(): Promise<void> {
  const pending = await umzug.pending();
  if (pending.length === 0) {
    logger.info("No pending migrations");
    return;
  }
  logger.info(`Running ${pending.length} pending migration(s)`);
  await umzug.up();
  logger.info("All migrations applied successfully");
}

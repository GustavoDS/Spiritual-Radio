import { Umzug, SequelizeStorage } from "umzug";
import { DataTypes, type QueryInterface } from "sequelize";
import { sequelize } from "../config/database.js";
import { logger } from "../lib/logger.js";

type Ctx = { context: QueryInterface };

// ---------------------------------------------------------------------------
// Helpers — all migrations must be idempotent (DB may already have been
// created via sequelize.sync() before migrations were introduced).
// ---------------------------------------------------------------------------

function getSeq(qi: QueryInterface): { query: (q: string, o?: object) => Promise<unknown[][]> } {
  return (qi as unknown as { sequelize: { query: (q: string, o?: object) => Promise<unknown[][]> } }).sequelize;
}

async function sql(qi: QueryInterface, query: string): Promise<void> {
  await getSeq(qi).query(query);
}

async function tableExists(qi: QueryInterface, tableName: string): Promise<boolean> {
  const rows = await getSeq(qi).query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName}' LIMIT 1`,
    { type: "SELECT" } as object,
  ) as unknown[][];
  return Array.isArray(rows) && rows.length > 0;
}

async function columnExists(qi: QueryInterface, tableName: string, columnName: string): Promise<boolean> {
  const rows = await getSeq(qi).query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}' AND column_name = '${columnName}' LIMIT 1`,
    { type: "SELECT" } as object,
  ) as unknown[][];
  return Array.isArray(rows) && rows.length > 0;
}

const migrations = [
  // ── Original schema ───────────────────────────────────────────────────────
  // Guards: each migration checks whether the table/column already exists so
  // it is safe to run against a DB that was bootstrapped via sequelize.sync().
  {
    name: "01-create-users",
    async up({ context: qi }: Ctx) {
      if (await tableExists(qi, "users")) return;
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
      if (await tableExists(qi, "channels")) return;
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
      if (await tableExists(qi, "categories")) return;
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
      if (await tableExists(qi, "contents")) return;
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
      if (await tableExists(qi, "voices")) return;
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
      if (await tableExists(qi, "schedules")) return;
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
      if (await tableExists(qi, "playlists")) return;
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
      if (await tableExists(qi, "playlist_items")) return;
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
  {
    name: "09-add-voice-id-externo",
    async up({ context: qi }: Ctx) {
      if (await columnExists(qi, "voices", "voice_id_externo")) return;
      await qi.addColumn("voices", "voice_id_externo", {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "ID técnico do provider TTS. ElevenLabs: voice_id; OpenAI: nome da voz (nova, alloy, etc.)",
      });
    },
    async down({ context: qi }: Ctx) {
      await qi.removeColumn("voices", "voice_id_externo");
    },
  },

  // ── New tables added via sync only — now made explicit ────────────────────

  {
    name: "10-create-contact-messages",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        DO $$ BEGIN
          CREATE TYPE "enum_contact_messages_tipo" AS ENUM ('contato','pedido_oracao','testemunho','sugestao');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN
          CREATE TYPE "enum_contact_messages_status" AS ENUM ('novo','em_analise','respondido','arquivado');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN
          CREATE TYPE "enum_contact_messages_prioridade" AS ENUM ('baixa','normal','alta','urgente');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        CREATE TABLE IF NOT EXISTS contact_messages (
          id            SERIAL PRIMARY KEY,
          nome          VARCHAR(255)                          NOT NULL,
          email         VARCHAR(255),
          telefone      VARCHAR(50),
          assunto       VARCHAR(255)                          NOT NULL,
          mensagem      TEXT                                  NOT NULL,
          tipo          "enum_contact_messages_tipo"          NOT NULL DEFAULT 'contato',
          status        "enum_contact_messages_status"        NOT NULL DEFAULT 'novo',
          prioridade    "enum_contact_messages_prioridade"    NOT NULL DEFAULT 'normal',
          canal_origem  VARCHAR(100),
          ip            VARCHAR(45),
          user_agent    VARCHAR(500),
          resposta_admin TEXT,
          respondido_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
          respondido_em TIMESTAMPTZ,
          lido_em       TIMESTAMPTZ,
          "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("contact_messages"); },
  },

  {
    name: "11-create-radio-plays",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        CREATE TABLE IF NOT EXISTS radio_plays (
          id          SERIAL PRIMARY KEY,
          channel_id  INTEGER,
          content_id  INTEGER,
          titulo      VARCHAR(512) NOT NULL DEFAULT '(desconhecido)',
          tipo        VARCHAR(64)  NOT NULL DEFAULT 'desconhecido',
          played_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
          "createdAt" TIMESTAMPTZ  NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS radio_plays_channel_id ON radio_plays (channel_id);
        CREATE INDEX IF NOT EXISTS radio_plays_content_id ON radio_plays (content_id);
        CREATE INDEX IF NOT EXISTS radio_plays_played_at  ON radio_plays (played_at);
      `);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("radio_plays"); },
  },

  {
    name: "12-create-ai-events",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        DO $$ BEGIN
          CREATE TYPE "enum_ai_events_event_type" AS ENUM ('ai_generation','tts_synthesis');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        CREATE TABLE IF NOT EXISTS ai_events (
          id                 SERIAL PRIMARY KEY,
          event_type         "enum_ai_events_event_type" NOT NULL,
          provider           VARCHAR(64)  NOT NULL,
          model              VARCHAR(128),
          chars_in           INTEGER      NOT NULL DEFAULT 0,
          tokens_est         INTEGER,
          cost_usd_est       FLOAT,
          duration_ms        INTEGER      NOT NULL DEFAULT 0,
          success            BOOLEAN      NOT NULL DEFAULT true,
          error              TEXT,
          content_id         INTEGER,
          audio_duration_sec FLOAT,
          "createdAt"        TIMESTAMPTZ  NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ai_events_event_type ON ai_events (event_type);
        CREATE INDEX IF NOT EXISTS ai_events_created_at ON ai_events ("createdAt");
      `);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("ai_events"); },
  },

  {
    name: "13-create-automation-rules",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        DO $$ BEGIN
          CREATE TYPE "enum_automation_rules_period" AS ENUM (
            'madrugada','morning','afternoon','evening','night','sunday','holiday','special'
          );
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        CREATE TABLE IF NOT EXISTS automation_rules (
          id               SERIAL PRIMARY KEY,
          channel_id       INTEGER,
          period           "enum_automation_rules_period" NOT NULL,
          enabled          BOOLEAN   NOT NULL DEFAULT true,
          content_types    TEXT[]    NOT NULL DEFAULT ARRAY['devocional'],
          topics           TEXT[]    NOT NULL DEFAULT '{}',
          voice_style      VARCHAR(50) NOT NULL DEFAULT 'calm',
          min_duration_sec INTEGER   NOT NULL DEFAULT 60,
          max_duration_sec INTEGER   NOT NULL DEFAULT 300,
          generation_limit INTEGER   NOT NULL DEFAULT 3,
          cooldown_hours   INTEGER   NOT NULL DEFAULT 4,
          auto_generate    BOOLEAN   NOT NULL DEFAULT true,
          auto_publish     BOOLEAN   NOT NULL DEFAULT true,
          tts_enabled      BOOLEAN   NOT NULL DEFAULT true,
          priority_level   INTEGER   NOT NULL DEFAULT 5,
          "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS automation_rules_period     ON automation_rules (period);
        CREATE INDEX IF NOT EXISTS automation_rules_channel_id ON automation_rules (channel_id);
        CREATE INDEX IF NOT EXISTS automation_rules_enabled    ON automation_rules (enabled);
        CREATE UNIQUE INDEX IF NOT EXISTS automation_rules_channel_period
          ON automation_rules (channel_id, period) WHERE channel_id IS NOT NULL;
      `);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("automation_rules"); },
  },

  {
    name: "14-create-automation-logs",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        DO $$ BEGIN
          CREATE TYPE "enum_automation_logs_triggered_by" AS ENUM ('scheduler','manual','gap_fill','fallback');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN
          CREATE TYPE "enum_automation_logs_status" AS ENUM ('started','running','completed','failed','partial');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        CREATE TABLE IF NOT EXISTS automation_logs (
          id                  SERIAL PRIMARY KEY,
          run_id              UUID         NOT NULL,
          channel_id          INTEGER,
          period              VARCHAR(30)  NOT NULL,
          triggered_by        "enum_automation_logs_triggered_by" NOT NULL DEFAULT 'scheduler',
          status              "enum_automation_logs_status"       NOT NULL DEFAULT 'started',
          contents_generated  INTEGER      NOT NULL DEFAULT 0,
          contents_failed     INTEGER      NOT NULL DEFAULT 0,
          cost_usd_est        DECIMAL(12,8) NOT NULL DEFAULT 0,
          duration_ms         INTEGER,
          error               TEXT,
          metadata            JSONB,
          "createdAt"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
          "updatedAt"         TIMESTAMPTZ  NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS automation_logs_run_id      ON automation_logs (run_id);
        CREATE INDEX IF NOT EXISTS automation_logs_channel_id  ON automation_logs (channel_id);
        CREATE INDEX IF NOT EXISTS automation_logs_period      ON automation_logs (period);
        CREATE INDEX IF NOT EXISTS automation_logs_status      ON automation_logs (status);
        CREATE INDEX IF NOT EXISTS automation_logs_created_at  ON automation_logs ("createdAt");
      `);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("automation_logs"); },
  },

  {
    name: "15-create-programas",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        DO $$ BEGIN
          CREATE TYPE "enum_programas_bloco" AS ENUM (
            'madrugada','amanhecer','manha','almoco','tarde','prime','noite','devocional','sleep','custom'
          );
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        CREATE TABLE IF NOT EXISTS programas (
          id          SERIAL PRIMARY KEY,
          nome        VARCHAR(255) NOT NULL,
          descricao   TEXT,
          duracao_min INTEGER      NOT NULL,
          bloco       "enum_programas_bloco" NOT NULL,
          receita     JSONB        NOT NULL DEFAULT '[]',
          regras      JSONB        NOT NULL DEFAULT '{}',
          channel_id  INTEGER,
          ativo       BOOLEAN      NOT NULL DEFAULT true,
          "createdAt" TIMESTAMPTZ  NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMPTZ  NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS programas_channel_id ON programas (channel_id);
        CREATE INDEX IF NOT EXISTS programas_bloco      ON programas (bloco);
        CREATE INDEX IF NOT EXISTS programas_ativo      ON programas (ativo);
        CREATE UNIQUE INDEX IF NOT EXISTS programas_channel_nome
          ON programas (channel_id, nome) WHERE ativo = true;
      `);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("programas"); },
  },

  {
    name: "16-create-grade-programas",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        CREATE TABLE IF NOT EXISTS grade_programas (
          id              SERIAL PRIMARY KEY,
          programa_id     INTEGER NOT NULL REFERENCES programas(id)  ON DELETE CASCADE,
          channel_id      INTEGER NOT NULL REFERENCES channels(id),
          horario_inicio  TIME    NOT NULL,
          dias_semana     INTEGER[] NOT NULL DEFAULT '{}',
          data            DATE,
          prioridade      INTEGER NOT NULL DEFAULT 0,
          ativo           BOOLEAN NOT NULL DEFAULT true,
          "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS grade_programas_programa_id    ON grade_programas (programa_id);
        CREATE INDEX IF NOT EXISTS grade_programas_channel_id     ON grade_programas (channel_id);
        CREATE INDEX IF NOT EXISTS grade_programas_horario_inicio ON grade_programas (horario_inicio);
        CREATE INDEX IF NOT EXISTS grade_programas_data           ON grade_programas (data);
      `);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("grade_programas"); },
  },

  {
    name: "17-create-play-history",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        CREATE TABLE IF NOT EXISTS play_history (
          id          SERIAL PRIMARY KEY,
          content_id  INTEGER NOT NULL REFERENCES contents(id)  ON DELETE CASCADE,
          channel_id  INTEGER NOT NULL REFERENCES channels(id),
          played_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          programa_id INTEGER REFERENCES programas(id) ON DELETE SET NULL,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS play_history_content_id  ON play_history (content_id);
        CREATE INDEX IF NOT EXISTS play_history_channel_id  ON play_history (channel_id);
        CREATE INDEX IF NOT EXISTS play_history_played_at   ON play_history (played_at);
        CREATE INDEX IF NOT EXISTS play_history_programa_id ON play_history (programa_id);
      `);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("play_history"); },
  },

  // ── Background Tracks feature ─────────────────────────────────────────────

  {
    name: "18-contents-add-background-track-fields",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        ALTER TABLE contents
          ADD COLUMN IF NOT EXISTS mixed_audio_url     TEXT,
          ADD COLUMN IF NOT EXISTS background_track_id UUID;

        COMMENT ON COLUMN contents.mixed_audio_url IS
          'Pre-rendered mix of voice + background track. Used by HLS stream instead of audio_url when set.';
        COMMENT ON COLUMN contents.background_track_id IS
          'Fixed background track UUID. If null, a random track from the category is used at mix time.';
      `);
    },
    async down({ context: qi }: Ctx) {
      await sql(qi, `
        ALTER TABLE contents
          DROP COLUMN IF EXISTS mixed_audio_url,
          DROP COLUMN IF EXISTS background_track_id;
      `);
    },
  },

  {
    name: "19-create-background-tracks",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        DO $$ BEGIN
          CREATE TYPE "enum_background_tracks_category" AS ENUM ('oracao','reflexao','mensagem','generico');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN
          CREATE TYPE "enum_background_tracks_source" AS ENUM ('manual','elevenlabs');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;

        CREATE TABLE IF NOT EXISTS background_tracks (
          id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          name             VARCHAR(255) NOT NULL,
          url              TEXT        NOT NULL,
          category         "enum_background_tracks_category" NOT NULL DEFAULT 'generico',
          duration_seconds DECIMAL(10,2),
          tags             TEXT[]      NOT NULL DEFAULT '{}',
          source           "enum_background_tracks_source"   NOT NULL DEFAULT 'manual',
          prompt           TEXT,
          "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS background_tracks_category ON background_tracks (category);
        CREATE INDEX IF NOT EXISTS background_tracks_source   ON background_tracks (source);
      `);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("background_tracks"); },
  },

  {
    name: "20-create-background-track-settings",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        CREATE TABLE IF NOT EXISTS background_track_settings (
          content_type     VARCHAR(100) PRIMARY KEY,
          enabled          BOOLEAN      NOT NULL DEFAULT true,
          volume_base      NUMERIC(5,2) NOT NULL DEFAULT 0.25,
          ducking_db       INTEGER      NOT NULL DEFAULT -18,
          fade_in_ms       INTEGER      NOT NULL DEFAULT 1500,
          fade_out_ms      INTEGER      NOT NULL DEFAULT 2000,
          default_category VARCHAR(100)
        );

        COMMENT ON COLUMN background_track_settings.content_type IS 'oracao | reflexao | mensagem';
        COMMENT ON COLUMN background_track_settings.volume_base  IS 'Background volume 0..1';
        COMMENT ON COLUMN background_track_settings.ducking_db   IS 'Approximate ducking depth in dB (controls sidechain ratio)';
      `);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("background_track_settings"); },
  },

  {
    name: "21-create-mixed-audio-cache",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        CREATE TABLE IF NOT EXISTS mixed_audio_cache (
          id           SERIAL PRIMARY KEY,
          hash         VARCHAR(64)  NOT NULL UNIQUE,
          url          TEXT         NOT NULL,
          duration_sec INTEGER,
          "createdAt"  TIMESTAMPTZ  NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS mixed_audio_cache_hash ON mixed_audio_cache (hash);

        COMMENT ON COLUMN mixed_audio_cache.hash IS 'SHA-256 of voice_url + track_id + mix settings';
      `);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("mixed_audio_cache"); },
  },

  // ── Vinhetas feature ──────────────────────────────────────────────────────

  {
    name: "22-create-vinhetas",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        CREATE TABLE IF NOT EXISTS vinhetas (
          id          SERIAL PRIMARY KEY,
          channel_id  INTEGER REFERENCES channels(id) ON DELETE CASCADE,
          nome        VARCHAR(255) NOT NULL,
          texto       TEXT         NOT NULL,
          audio_url   VARCHAR(500),
          duracao_sec INTEGER,
          bloco       VARCHAR(50)  NOT NULL,
          tipo_vinheta VARCHAR(50) NOT NULL,
          voice_id    VARCHAR(100),
          ativo       BOOLEAN      NOT NULL DEFAULT true,
          prioridade  INTEGER      NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMPTZ  NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMPTZ  NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS vinhetas_channel_bloco_tipo_ativo
          ON vinhetas (channel_id, bloco, tipo_vinheta, ativo);
        CREATE INDEX IF NOT EXISTS vinhetas_bloco      ON vinhetas (bloco);
        CREATE INDEX IF NOT EXISTS vinhetas_tipo       ON vinhetas (tipo_vinheta);
        CREATE INDEX IF NOT EXISTS vinhetas_ativo      ON vinhetas (ativo);

        COMMENT ON COLUMN vinhetas.bloco IS
          'madrugada|amanhecer|manha|almoco|tarde|prime|noite|devocional|sleep';
        COMMENT ON COLUMN vinhetas.tipo_vinheta IS
          'abertura|transicao|encerramento|antes_de_oracao|antes_de_mensagem|antes_de_versiculo';
        COMMENT ON COLUMN vinhetas.voice_id IS
          'External TTS voice ID (e.g. ElevenLabs voice_id). Used to pick a Voice record for synthesis.';
      `);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("vinhetas"); },
  },

  {
    name: "23-create-vinheta-execucoes",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        CREATE TABLE IF NOT EXISTS vinheta_execucoes (
          id           SERIAL PRIMARY KEY,
          vinheta_id   INTEGER NOT NULL REFERENCES vinhetas(id) ON DELETE CASCADE,
          channel_id   INTEGER,
          executada_em TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS vinheta_execucoes_vinheta_channel_time
          ON vinheta_execucoes (vinheta_id, channel_id, executada_em);
      `);
    },
    async down({ context: qi }: Ctx) { await qi.dropTable("vinheta_execucoes"); },
  },

  {
    name: "25-vinhetas-add-bed-and-sfx",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        ALTER TABLE vinhetas
          ADD COLUMN IF NOT EXISTS background_track_id UUID NULL REFERENCES background_tracks(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS sfx_intro_url       TEXT NULL,
          ADD COLUMN IF NOT EXISTS sfx_outro_url       TEXT NULL,
          ADD COLUMN IF NOT EXISTS bed_volume_db       INTEGER NOT NULL DEFAULT -20,
          ADD COLUMN IF NOT EXISTS ducking_enabled     BOOLEAN NOT NULL DEFAULT true;

        CREATE INDEX IF NOT EXISTS idx_vinhetas_background_track
          ON vinhetas (background_track_id);

        COMMENT ON COLUMN vinhetas.background_track_id IS
          'Bed musical track played underneath the TTS voice. NULL = no bed.';
        COMMENT ON COLUMN vinhetas.sfx_intro_url IS
          'URL of the intro stinger SFX. Generated via ElevenLabs Sound Effects API and cached in storage.';
        COMMENT ON COLUMN vinhetas.sfx_outro_url IS
          'URL of the optional outro stinger SFX.';
        COMMENT ON COLUMN vinhetas.bed_volume_db IS
          'Bed track volume in dB relative to voice (default -20 = very soft background).';
        COMMENT ON COLUMN vinhetas.ducking_enabled IS
          'If true, the bed is ducked (sidechaincompress) when the voice is present.';
      `);
    },
    async down({ context: qi }: Ctx) {
      await sql(qi, `
        ALTER TABLE vinhetas
          DROP COLUMN IF EXISTS background_track_id,
          DROP COLUMN IF EXISTS sfx_intro_url,
          DROP COLUMN IF EXISTS sfx_outro_url,
          DROP COLUMN IF EXISTS bed_volume_db,
          DROP COLUMN IF EXISTS ducking_enabled;
      `);
    },
  },

  {
    name: "27-create-content-vinheta-channels-junction",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        CREATE TABLE IF NOT EXISTS content_channels (
          content_id  INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
          channel_id  INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (content_id, channel_id)
        );
        CREATE INDEX IF NOT EXISTS idx_content_channels_channel ON content_channels (channel_id);

        CREATE TABLE IF NOT EXISTS vinheta_channels (
          vinheta_id  INTEGER NOT NULL REFERENCES vinhetas(id)  ON DELETE CASCADE,
          channel_id  INTEGER NOT NULL REFERENCES channels(id)  ON DELETE CASCADE,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (vinheta_id, channel_id)
        );
        CREATE INDEX IF NOT EXISTS idx_vinheta_channels_channel ON vinheta_channels (channel_id);

        -- Backfill from existing channel_id columns
        INSERT INTO content_channels (content_id, channel_id)
          SELECT id, channel_id FROM contents WHERE channel_id IS NOT NULL
          ON CONFLICT DO NOTHING;

        INSERT INTO vinheta_channels (vinheta_id, channel_id)
          SELECT id, channel_id FROM vinhetas WHERE channel_id IS NOT NULL
          ON CONFLICT DO NOTHING;

        COMMENT ON TABLE content_channels IS 'N:N join between contents and channels. channel_id on contents is kept for legacy compat.';
        COMMENT ON TABLE vinheta_channels IS 'N:N join between vinhetas and channels. channel_id on vinhetas is kept for legacy compat.';
      `);
    },
    async down({ context: qi }: Ctx) {
      await sql(qi, `
        DROP TABLE IF EXISTS vinheta_channels;
        DROP TABLE IF EXISTS content_channels;
      `);
    },
  },

  {
    name: "26-background-tracks-add-versiculo-category",
    // ALTER TYPE … ADD VALUE cannot run inside a transaction in Postgres.
    // We call raw SQL with transaction: null to bypass Umzug's default transaction.
    async up({ context: qi }: Ctx) {
      await getSeq(qi).query(
        `ALTER TYPE "enum_background_tracks_category" ADD VALUE IF NOT EXISTS 'versiculo';`,
        { transaction: null } as object,
      );
    },
    async down() {
      // Postgres does not support removing enum values — no-op for rollback.
      // To remove it, recreate the enum and migrate existing rows manually.
    },
  },

  {
    name: "24-contents-add-usa-vinheta-automatica",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        ALTER TABLE contents
          ADD COLUMN IF NOT EXISTS usa_vinheta_automatica BOOLEAN NOT NULL DEFAULT true;

        COMMENT ON COLUMN contents.usa_vinheta_automatica IS
          'Se true, vinhetas são injetadas automaticamente antes deste conteúdo (padrão). Use false para músicas ou conteúdos com intro embutida.';
      `);
    },
    async down({ context: qi }: Ctx) {
      await sql(qi, `ALTER TABLE contents DROP COLUMN IF EXISTS usa_vinheta_automatica;`);
    },
  },

  {
    name: "29-background-track-settings-seed",
    async up({ context: qi }: Ctx) {
      // Ensure all 4 spoken types have settings.
      // reflexao → default_category = 'oracao' (reuses oracao tracks as fallback)
      // mensagem → default_category = 'oracao'
      // versiculo → default_category = 'versiculo'
      // oracao stays as-is (already seeded at app startup)
      await sql(qi, `
        INSERT INTO background_track_settings (content_type, enabled, volume_base, ducking_db, fade_in_ms, fade_out_ms, default_category)
        VALUES
          ('oracao',    true, 0.30, -18, 1500, 2000, 'oracao'),
          ('reflexao',  true, 0.20, -18, 1500, 2000, 'oracao'),
          ('mensagem',  true, 0.20, -18, 1500, 2000, 'oracao'),
          ('versiculo', true, 0.15, -18, 1000, 1500, 'versiculo')
        ON CONFLICT (content_type) DO UPDATE
          SET default_category = EXCLUDED.default_category,
              enabled          = EXCLUDED.enabled;
      `);
    },
    async down({ context: qi }: Ctx) {
      await sql(qi, `
        DELETE FROM background_track_settings
        WHERE content_type IN ('mensagem', 'versiculo');
        UPDATE background_track_settings
          SET default_category = NULL
          WHERE content_type = 'reflexao';
      `);
    },
  },

  {
    name: "30-fix-versiculo-background-settings",
    async up({ context: qi }: Ctx) {
      // versiculo was seeded with wrong fade times (1000/1500) and weak ducking (-18 → ratio 8).
      // Fix: standardise fade to 1500/2000 ms and strengthen ducking to -22 dB (ratio ≈ 12.7)
      // so the voice is clearly above the background track throughout the segment.
      await sql(qi, `
        UPDATE background_track_settings
        SET
          volume_base  = 0.20,
          ducking_db   = -22,
          fade_in_ms   = 1500,
          fade_out_ms  = 2000
        WHERE content_type = 'versiculo';
      `);
    },
    async down({ context: qi }: Ctx) {
      await sql(qi, `
        UPDATE background_track_settings
        SET volume_base = 0.15, ducking_db = -18, fade_in_ms = 1000, fade_out_ms = 1500
        WHERE content_type = 'versiculo';
      `);
    },
  },

  {
    name: "28-playlist-items-add-vinheta-columns",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        ALTER TABLE playlist_items
          ADD COLUMN IF NOT EXISTS vinheta_url     TEXT,
          ADD COLUMN IF NOT EXISTS vinheta_duracao INTEGER,
          ADD COLUMN IF NOT EXISTS vinheta_titulo  VARCHAR(500);

        COMMENT ON COLUMN playlist_items.vinheta_url IS
          'Audio URL for a vinheta item. When set, content_id is NULL.';
        COMMENT ON COLUMN playlist_items.vinheta_duracao IS
          'Duration in seconds of the vinheta segment.';
        COMMENT ON COLUMN playlist_items.vinheta_titulo IS
          'Display name of the vinheta (for now-playing metadata).';
      `);
    },
    async down({ context: qi }: Ctx) {
      await sql(qi, `
        ALTER TABLE playlist_items
          DROP COLUMN IF EXISTS vinheta_url,
          DROP COLUMN IF EXISTS vinheta_duracao,
          DROP COLUMN IF EXISTS vinheta_titulo;
      `);
    },
  },

  // ── Day Block Items — materialização persistente de resolve-day ───────────

  {
    name: "31-create-day-block-items",
    async up({ context: qi }: Ctx) {
      await sql(qi, `
        CREATE TABLE IF NOT EXISTS day_block_items (
          id          BIGSERIAL   PRIMARY KEY,
          date        DATE        NOT NULL,
          channel_id  BIGINT      NULL REFERENCES channels(id)      ON DELETE CASCADE,
          grade_id    BIGINT      NOT NULL REFERENCES grade_programas(id) ON DELETE CASCADE,
          programa_id BIGINT      NOT NULL REFERENCES programas(id),
          ordem       INTEGER     NOT NULL,
          tipo        VARCHAR(40) NOT NULL,
          content_id  BIGINT      NULL REFERENCES contents(id)      ON DELETE SET NULL,
          duracao_sec INTEGER     NOT NULL DEFAULT 0,
          source      VARCHAR(20) NOT NULL DEFAULT 'auto',
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        COMMENT ON TABLE  day_block_items IS
          'Persistent materialisation of POST /grade-programas/resolve-day. '
          'source=auto: lottery result; source=manual: admin edit.';
        COMMENT ON COLUMN day_block_items.ordem IS
          '0-based position of the item within its program block.';
        COMMENT ON COLUMN day_block_items.source IS
          'auto = written by the lottery on first resolve-day call; '
          'manual = replaced via PUT /day-block-items/bulk by an admin.';

        -- Primary lookup: all items for a given day + channel
        CREATE INDEX IF NOT EXISTS day_block_items_date_channel
          ON day_block_items (date, channel_id);

        -- Per-block lookup used by resolveDay cache-check
        CREATE INDEX IF NOT EXISTS day_block_items_date_channel_grade
          ON day_block_items (date, channel_id, grade_id);

        -- Unique position within a block.
        -- COALESCE(channel_id, 0) is required because NULL != NULL in Postgres,
        -- so a plain unique index on (date, channel_id, grade_id, ordem) would
        -- allow duplicate (date, NULL, grade_id, ordem) rows.
        CREATE UNIQUE INDEX IF NOT EXISTS day_block_items_unique
          ON day_block_items (date, COALESCE(channel_id, 0), grade_id, ordem);
      `);
    },
    async down({ context: qi }: Ctx) {
      await qi.dropTable("day_block_items");
    },
  },
];

function umzugLog(level: "info" | "warn" | "error" | "debug", m: unknown): void {
  if (typeof m === "string") {
    logger[level](m);
    return;
  }
  const obj = m as Record<string, unknown>;
  const event = typeof obj.event === "string" ? obj.event : level;
  const name  = typeof obj.name  === "string" ? obj.name  : undefined;
  logger[level](`migration: ${event}`, name ? { name, ...obj } : obj);
}

export const umzug = new Umzug({
  migrations,
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: {
    info:  (m) => umzugLog("info",  m),
    warn:  (m) => umzugLog("warn",  m),
    error: (m) => umzugLog("error", m),
    debug: (m) => umzugLog("debug", m),
  },
});

export async function runMigrations(): Promise<void> {
  const pending = await umzug.pending();
  if (pending.length === 0) {
    logger.info("migrations: no pending migrations");
    return;
  }
  logger.info(`migrations: running ${pending.length} pending migration(s)`, {
    names: pending.map((m) => m.name),
  });
  await umzug.up();
  logger.info("migrations: all applied successfully");
}

import app from "./app.js";
import { logger } from "./lib/logger.js";
import { connectDatabase } from "./config/database.js";
import { redis } from "./config/redis.js";
import { syncDatabase } from "./models/index.js";
import { runMigrations } from "./migrations/runner.js";
import { env } from "./config/env.js";
import { startContentProcessingWorker, startVoiceSynthesisWorker } from "./jobs/contentProcessingJob.js";
import { startScheduleWorker } from "./jobs/scheduleJob.js";
import { startCleanupWorker } from "./jobs/cleanupJob.js";
import { startAutomationWorker } from "./jobs/automationJob.js";
import { automationService } from "./services/AutomationService.js";
import { autoDjService } from "./services/AutoDJService.js";
import { playlistMaterializationService } from "./services/PlaylistMaterializationService.js";
import { vinhetasService } from "./modules/vinhetas/vinhetas.service.js";
import { streamSessionStore } from "./services/StreamSessionStore.js";
import { scheduleQueue, cleanupQueue } from "./queues/index.js";
import { Channel, Playlist } from "./models/index.js";
import { playlistService } from "./services/PlaylistService.js";
import { realtimeService } from "./services/RealtimeService.js";
import type { Worker } from "bullmq";
import type { Server } from "node:http";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

if (env.nodeEnv === "production" && env.jwtSecret === "changeme-jwt-secret") {
  logger.error("FATAL: JWT_SECRET is set to the default insecure value. Set a strong secret before running in production.");
  process.exit(1);
}

if (env.nodeEnv === "production" && env.jwtRefreshSecret === "changeme-jwt-refresh-secret") {
  logger.error("FATAL: JWT_REFRESH_SECRET is set to the default insecure value. Set a strong secret before running in production.");
  process.exit(1);
}

const workers: Worker[] = [];
let httpServer: Server | null = null;

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal} — starting graceful shutdown`);

  if (httpServer) {
    httpServer.close(() => logger.info("HTTP server closed"));
  }

  await Promise.allSettled(
    workers.map((w) =>
      w.close().then(() => logger.info(`Worker "${w.name}" closed`)).catch((err) =>
        logger.error(`Error closing worker "${w.name}"`, { err }),
      ),
    ),
  );

  try {
    await redis.quit();
    logger.info("Redis connection closed");
  } catch (err) {
    logger.warn("Redis quit error (ignored)", { err });
  }

  try {
    const { sequelize } = await import("./models/index.js");
    await sequelize.close();
    logger.info("Database connection closed");
  } catch (err) {
    logger.warn("Database close error (ignored)", { err });
  }

  logger.info("Graceful shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.includes("ECONNREFUSED") || msg.includes("Connection is closed") || msg.includes("maxRetriesPerRequest")) {
    logger.warn("Unhandled Redis rejection (suppressed — Redis unavailable)", { reason: msg });
    return;
  }
  logger.error("Unhandled promise rejection", { reason: msg });
});

async function setupCronJobs(): Promise<void> {
  try {
    await scheduleQueue.add(
      "daily-playlist-generation",
      {},
      {
        repeat: { pattern: "0 1 * * *" },
        jobId: "daily-playlist-cron",
      },
    );
    logger.info("Cron: daily playlist generation registered (01:00 every day)");

    await cleanupQueue.add(
      "daily-orphan-cleanup",
      { dryRun: false },
      {
        repeat: { pattern: "0 3 * * *" },
        jobId: "daily-cleanup-cron",
      },
    );
    logger.info("Cron: daily orphan file cleanup registered (03:00 every day)");
  } catch (err) {
    logger.warn("Cron: failed to register repeat jobs — Redis may be unavailable", { err });
  }
}

async function generateImmediatePlaylists(): Promise<void> {
  try {
    const today = new Date().toISOString().split("T")[0]!;
    const channels = await Channel.findAll({ where: { ativo: true }, attributes: ["id"] });

    if (channels.length === 0) {
      logger.info("Immediate playlist: no active channels found — skipping");
      return;
    }

    const missing: number[] = [];
    for (const ch of channels) {
      const existing = await Playlist.findOne({ where: { channel_id: ch.id, data: today } });
      if (!existing) missing.push(ch.id);
    }

    if (missing.length === 0) {
      logger.info("Immediate playlist: all channels already have a playlist for today", { today });
      return;
    }

    for (const channelId of missing) {
      await scheduleQueue.add("immediate-playlist", { channelId, date: today });
      logger.info("Immediate playlist: queued generation", { channelId, today });
    }
  } catch (err) {
    logger.warn("Immediate playlist generation skipped (Redis unavailable or DB error)", { err });
  }
}

async function bootstrap(): Promise<void> {
  try {
    await connectDatabase();
    await runMigrations();
    await syncDatabase();
    logger.info("Database synchronized");

    realtimeService.startTrackWatcher(
      async () => {
        const channels = await Channel.findAll({ where: { ativo: true }, attributes: ["id"] });
        return channels.map((c) => c.id);
      },
      async (channelId) => {
        try {
          const track = await playlistService.getCurrentTrack(channelId);
          if (!track) return null;
          const content = (track as unknown as { content: Record<string, unknown> | null }).content;
          if (!content) return null;
          return {
            id: content["id"] as number,
            titulo: content["titulo"] as string | undefined,
            audioUrl: content["audio_url"] as string | undefined,
            artworkUrl: content["artwork_url"] as string | undefined,
          };
        } catch {
          return null;
        }
      },
      async (channelId) => {
        try {
          const track = await playlistService.getNextTrack(channelId);
          if (!track) return null;
          const content = (track as unknown as { content: Record<string, unknown> | null }).content;
          if (!content) return null;
          return {
            id: content["id"] as number,
            titulo: content["titulo"] as string | undefined,
          };
        } catch {
          return null;
        }
      },
      60_000,
    );

    let redisReady = false;
    try {
      await redis.connect();
      redisReady = redis.status === "ready";
    } catch {
      logger.warn("Redis connection failed – queues, cache and blacklist will be unavailable");
    }

    if (redisReady) {
      try {
        workers.push(startContentProcessingWorker());
        workers.push(startVoiceSynthesisWorker());
        workers.push(startScheduleWorker());
        workers.push(startCleanupWorker());
        workers.push(startAutomationWorker());
        logger.info("BullMQ workers started (content-processing, voice-synthesis, schedule, cleanup, automation)");

        await setupCronJobs();
        await generateImmediatePlaylists();
      } catch (err) {
        logger.warn("BullMQ workers/cron setup error", { err });
      }
    } else {
      logger.warn("BullMQ workers NOT started — Redis unavailable. Queues, cron and cache disabled.");
    }

    // Automation timer: runs every 30 min regardless of Redis availability
    automationService.startTimer(30 * 60 * 1000);

    // AutoDJ: continuous streaming layer, runs regardless of Redis
    autoDjService.startWatcher();
    streamSessionStore.startCleanup();
    logger.info("AutoDJ watcher and stream session store started");

    // Playlist materialization: builds Playlist+PlaylistItem rows from grade_programas
    // so AutoDJService can find them. Runs at startup + every 15 minutes.
    // Always materializes TODAY + TOMORROW so the AutoDJ never hits a missing-
    // playlist gap when the clock rolls past midnight.
    const materializeSchedule = () => {
      void playlistMaterializationService.materializeAllChannels().catch(err =>
        logger.warn("Playlist materialization failed", { err: (err as Error).message }),
      );
    };
    materializeSchedule();
    const MATERIALIZE_INTERVAL_MS = 15 * 60 * 1000;
    const materializeTimer = setInterval(materializeSchedule, MATERIALIZE_INTERVAL_MS);
    if ((materializeTimer as NodeJS.Timeout).unref) (materializeTimer as NodeJS.Timeout).unref();

    // Vinheta TTS: synthesize any vinheta that is missing audio_url.
    // Fire-and-forget — runs in background via concurrent workers inside the service.
    void vinhetasService.regenerarTodas(true).then(({ queued }) => {
      if (queued > 0) logger.info("Vinheta TTS synthesis started at startup", { queued });
    }).catch(err =>
      logger.warn("Vinheta TTS startup synthesis failed", { err: (err as Error).message }),
    );
  } catch (err) {
    logger.warn("Startup service error (app will still run)", { err });
  }

  httpServer = app.listen(port, () => {
    logger.info(`Server listening on port ${port} [${env.nodeEnv}]`);
    logger.info(`Swagger docs: http://localhost:${port}/api/docs`);
    logger.info(`Static files served from: /${env.uploadDir}/`);
    logger.info(`Storage provider: ${env.storageProvider}`);
  });
}

bootstrap().catch((err) => {
  logger.error("Fatal startup error", { err });
  process.exit(1);
});

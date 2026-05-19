import app from "./app.js";
import { logger } from "./lib/logger.js";
import { connectDatabase } from "./config/database.js";
import { redis } from "./config/redis.js";
import { syncDatabase } from "./models/index.js";
import { env } from "./config/env.js";
import { startContentProcessingWorker, startVoiceSynthesisWorker } from "./jobs/contentProcessingJob.js";
import { startScheduleWorker } from "./jobs/scheduleJob.js";
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

async function bootstrap(): Promise<void> {
  try {
    await connectDatabase();
    await syncDatabase();
    logger.info("Database synchronized");

    await redis.connect().catch(() => {
      logger.warn("Redis connection failed – queues will be unavailable");
    });

    try {
      workers.push(startContentProcessingWorker());
      workers.push(startVoiceSynthesisWorker());
      workers.push(startScheduleWorker());
      logger.info("BullMQ workers started (content-processing, voice-synthesis, schedule)");
    } catch (err) {
      logger.warn("BullMQ workers could not start – Redis may be unavailable", { err });
    }
  } catch (err) {
    logger.warn("Startup service error (app will still run)", { err });
  }

  httpServer = app.listen(port, () => {
    logger.info(`Server listening on port ${port} [${env.nodeEnv}]`);
    logger.info(`Swagger docs: http://localhost:${port}/api/docs`);
    logger.info(`Static files served from: /${env.uploadDir}/`);
  });
}

bootstrap().catch((err) => {
  logger.error("Fatal startup error", { err });
  process.exit(1);
});

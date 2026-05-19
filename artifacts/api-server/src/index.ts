import app from "./app.js";
import { logger } from "./lib/logger.js";
import { connectDatabase } from "./config/database.js";
import { redis } from "./config/redis.js";
import { syncDatabase } from "./models/index.js";
import { env } from "./config/env.js";
import { startContentProcessingWorker, startVoiceSynthesisWorker } from "./jobs/contentProcessingJob.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function bootstrap(): Promise<void> {
  try {
    await connectDatabase();
    await syncDatabase();
    logger.info("Database synchronized");

    await redis.connect().catch(() => {
      logger.warn("Redis connection failed – queues will be unavailable");
    });

    try {
      startContentProcessingWorker();
      startVoiceSynthesisWorker();
      logger.info("BullMQ workers started (content-processing, voice-synthesis)");
    } catch (err) {
      logger.warn("BullMQ workers could not start – Redis may be unavailable", { err });
    }
  } catch (err) {
    logger.warn("Startup service error (app will still run)", { err });
  }

  app.listen(port, () => {
    logger.info(`Server listening on port ${port} [${env.nodeEnv}]`);
    logger.info(`Swagger docs: http://localhost:${port}/api/docs`);
  });
}

bootstrap().catch((err) => {
  logger.error("Fatal startup error", { err });
  process.exit(1);
});

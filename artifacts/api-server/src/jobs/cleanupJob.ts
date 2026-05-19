import { Worker, type Job } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { logger } from "../lib/logger.js";
import { Content } from "../models/index.js";
import { env } from "../config/env.js";
import { storageProvider } from "../storage/index.js";
import path from "path";

export interface CleanupJobData {
  dryRun?: boolean;
}

async function getReferencedPaths(): Promise<Set<string>> {
  const contents = await Content.findAll({
    attributes: ["audio_url", "imagem_url"],
    raw: true,
  }) as unknown as Array<{ audio_url: string | null; imagem_url: string | null }>;

  const referenced = new Set<string>();
  for (const c of contents) {
    if (c.audio_url) referenced.add(normalizePath(c.audio_url));
    if (c.imagem_url) referenced.add(normalizePath(c.imagem_url));
  }
  return referenced;
}

function normalizePath(urlOrPath: string): string {
  const normalized = urlOrPath.replace(/\\/g, "/");
  const idx = normalized.indexOf("uploads/");
  return idx === -1 ? normalized : normalized.slice(idx);
}

function toStorageKey(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.indexOf("uploads/");
  return idx === -1 ? filePath : normalized.slice(idx);
}

export function startCleanupWorker(): Worker {
  const worker = new Worker<CleanupJobData>(
    "cleanup",
    async (job: Job<CleanupJobData>) => {
      const dryRun = job.data.dryRun ?? false;
      logger.info("CleanupJob started", { dryRun });

      if (env.storageProvider === "s3") {
        logger.info("CleanupJob: S3 cleanup not implemented — skipping");
        return;
      }

      const referenced = await getReferencedPaths();
      logger.info("CleanupJob: referenced files in DB", { count: referenced.size });

      let deleted = 0;
      let skipped = 0;
      let errors = 0;

      for (const subdir of ["audio", "images"] as const) {
        let files: string[];
        try {
          files = await storageProvider.listFiles(subdir);
        } catch (err) {
          logger.error("CleanupJob: failed to list files", { subdir, err });
          continue;
        }

        for (const filePath of files) {
          const key = toStorageKey(filePath);
          if (referenced.has(key)) {
            skipped++;
            continue;
          }

          const ext = path.extname(filePath).toLowerCase();
          if (![".mp3", ".wav", ".ogg", ".mp4", ".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
            skipped++;
            continue;
          }

          if (dryRun) {
            logger.info("CleanupJob: [DRY RUN] would delete", { filePath });
            deleted++;
          } else {
            try {
              await storageProvider.delete(filePath);
              logger.info("CleanupJob: deleted orphan file", { filePath });
              deleted++;
            } catch (err) {
              logger.error("CleanupJob: failed to delete file", { filePath, err });
              errors++;
            }
          }
        }
      }

      await job.updateProgress(100);
      logger.info("CleanupJob complete", { deleted, skipped, errors, dryRun });
    },
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on("completed", (job) =>
    logger.info("Cleanup job completed", { jobId: job.id }),
  );
  worker.on("failed", (job, err) =>
    logger.error("Cleanup job failed", { jobId: job?.id, err: err.message }),
  );
  worker.on("error", (err) =>
    logger.warn("cleanup worker error (Redis unavailable?)", { err: err.message }),
  );

  return worker;
}

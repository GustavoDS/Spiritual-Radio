import { logger } from "../lib/logger.js";

/**
 * Extract audio duration in seconds from a local file path.
 * Uses music-metadata (pure JS, no native binaries needed).
 * Returns null if extraction fails or file has no duration.
 */
export async function extractAudioDuration(filePath: string): Promise<number | null> {
  try {
    const mm = await import("music-metadata");
    const meta = await mm.parseFile(filePath, { duration: true });
    const sec = meta.format.duration;
    if (typeof sec === "number" && sec > 0) {
      return Math.round(sec);
    }
    return null;
  } catch (err) {
    logger.warn("audio-duration: failed to extract duration", {
      filePath,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

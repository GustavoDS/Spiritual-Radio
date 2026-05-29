import { Readable } from "stream";
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

/**
 * Extract audio duration in seconds by streaming from a remote URL.
 * Uses Node 18+ global fetch + music-metadata parseStream.
 * Returns null if the request fails or the stream has no duration info.
 */
export async function extractAudioDurationFromUrl(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!res.body) throw new Error("Response body is null");

    const mm = await import("music-metadata");
    const contentType = res.headers.get("content-type") ?? "audio/mpeg";
    const contentLength = res.headers.get("content-length");

    // Convert Web ReadableStream → Node.js Readable (required by music-metadata)
    const nodeStream = Readable.fromWeb(res.body as import("stream/web").ReadableStream);

    const meta = await mm.parseStream(
      nodeStream,
      {
        mimeType: contentType,
        size: contentLength ? Number(contentLength) : undefined,
      },
      { duration: true },
    );

    const sec = meta.format.duration;
    if (typeof sec === "number" && sec > 0) {
      return Math.round(sec);
    }
    return null;
  } catch (err) {
    logger.warn("audio-duration: failed to extract duration from URL", {
      url,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

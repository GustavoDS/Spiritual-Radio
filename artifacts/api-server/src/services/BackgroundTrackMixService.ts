import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { spawn } from "child_process";
import { logger } from "../lib/logger.js";
import { BackgroundTrack, BackgroundTrackSettings, MixedAudioCache, Content } from "../models/index.js";
import { storageProvider } from "../storage/index.js";

/* ─── Constants ──────────────────────────────────────────────────────────── */

const SPOKEN_TYPES = new Set(["oracao", "reflexao", "mensagem"]);
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
const DOWNLOAD_TIMEOUT_MS = 15_000;

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function computeMixHash(opts: {
  voiceUrl: string;
  trackId: string;
  volumeBase: number;
  duckingDb: number;
  fadeInMs: number;
  fadeOutMs: number;
}): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(opts))
    .digest("hex");
}

/** Maps ducking_db (e.g. -18) to an ffmpeg sidechain compress ratio. */
function duckingRatio(duckingDb: number): number {
  // -6 dB → ratio ~2, -12 dB → 4, -18 dB → 8, -24 dB → 16
  return Math.pow(2, Math.abs(duckingDb) / 6);
}

async function downloadUrl(url: string, destPath: string): Promise<void> {
  const { default: https } = await import("https");
  const { default: http } = await import("http");
  const parsed = new URL(url);
  const client = parsed.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Download timeout: ${url}`)),
      DOWNLOAD_TIMEOUT_MS,
    );

    const req = client.get(url, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        clearTimeout(timer);
        reject(new Error(`HTTP ${res.statusCode} downloading: ${url}`));
        return;
      }

      const ws = fs.createWriteStream(destPath);
      let received = 0;

      res.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_DOWNLOAD_BYTES) {
          req.destroy();
          ws.destroy();
          fs.unlink(destPath, () => {});
          clearTimeout(timer);
          reject(new Error(`File too large (>${MAX_DOWNLOAD_BYTES / 1024 / 1024}MB): ${url}`));
        }
      });

      res.pipe(ws);
      ws.on("finish", () => { clearTimeout(timer); resolve(); });
      ws.on("error", (e) => { clearTimeout(timer); reject(e); });
    });

    req.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

async function getAudioDurationSec(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "";
    proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
    proc.on("close", (code) => {
      const dur = parseFloat(out.trim());
      if (code !== 0 || isNaN(dur)) reject(new Error(`ffprobe failed (code ${code}): ${out}`));
      else resolve(dur);
    });
  });
}

async function runFfmpegBackground(opts: {
  voicePath: string;
  trackPath: string;
  outPath: string;
  volumeBase: number;
  duckingDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  voiceDurationSec: number;
}): Promise<void> {
  const fadeInSec = opts.fadeInMs / 1000;
  const fadeOutSec = opts.fadeOutMs / 1000;
  const fadeOutStart = Math.max(0, opts.voiceDurationSec - fadeOutSec);
  const ratio = duckingRatio(opts.duckingDb).toFixed(1);

  // Filtergraph per spec:
  // [1] = background track (stream_loop -1), [0] = voice
  const filter = [
    `[1:a]volume=${opts.volumeBase}[bg]`,
    `[bg][0:a]sidechaincompress=threshold=0.05:ratio=${ratio}:attack=5:release=400:makeup=1[ducked]`,
    `[ducked]afade=t=in:st=0:d=${fadeInSec},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOutSec}[bgfinal]`,
    `[0:a][bgfinal]amix=inputs=2:duration=first:dropout_transition=0[out]`,
  ].join(";");

  const args = [
    "-y",
    "-i", opts.voicePath,
    "-stream_loop", "-1",
    "-i", opts.trackPath,
    "-filter_complex", filter,
    "-map", "[out]",
    "-c:a", "libmp3lame",
    "-b:a", "128k",
    opts.outPath,
  ];

  logger.debug("BackgroundTrackMixService: ffmpeg", { args: args.join(" ") });

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) {
        logger.error("BackgroundTrackMixService: ffmpeg failed", { code, stderr: stderr.slice(-1000) });
        reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
      } else {
        resolve();
      }
    });
    proc.on("error", (e) => reject(new Error(`ffmpeg spawn error: ${e.message}`)));
  });
}

/* ─── BackgroundTrackMixService ──────────────────────────────────────────── */

export class BackgroundTrackMixService {
  /**
   * Main entry point for the HLS pipeline.
   * Returns the mixed audio URL if applicable, or the original audio_url as fallback.
   * Never throws — on any error, logs and returns the original URL.
   */
  async resolveAudioUrl(content: {
    id: number;
    tipo: string;
    audio_url: string | null;
    mixed_audio_url?: string | null;
    background_track_id?: string | null;
  }): Promise<string | null> {
    // If already mixed, return it directly
    if (content.mixed_audio_url) return content.mixed_audio_url;

    // Only process spoken-word content types
    if (!SPOKEN_TYPES.has(content.tipo) || !content.audio_url) {
      return content.audio_url ?? null;
    }

    try {
      const url = await this.mix({ ...content, audio_url: content.audio_url });
      return url ?? content.audio_url;
    } catch (err) {
      logger.warn("BackgroundTrackMixService: fallback to voice-only", {
        contentId: content.id,
        tipo: content.tipo,
        err: (err as Error).message,
      });
      return content.audio_url;
    }
  }

  /**
   * Mix voice + background track for a content item.
   * Returns the mixed URL, or null if no suitable track/settings found.
   */
  async mix(content: {
    id: number;
    tipo: string;
    audio_url: string;
    background_track_id?: string | null;
  }): Promise<string | null> {
    const t0 = Date.now();

    // 1. Load settings
    const settings = await BackgroundTrackSettings.findByPk(content.tipo);
    if (!settings || !settings.enabled) {
      logger.debug("BackgroundTrackMixService: no settings or disabled", { tipo: content.tipo });
      return null;
    }

    // 2. Select track
    const track = await this.selectTrack(content, settings);
    if (!track) {
      logger.debug("BackgroundTrackMixService: no track available", { tipo: content.tipo });
      return null;
    }

    // 3. Cache check
    const hash = computeMixHash({
      voiceUrl: content.audio_url,
      trackId: track.id,
      volumeBase: Number(settings.volume_base),
      duckingDb: settings.ducking_db,
      fadeInMs: settings.fade_in_ms,
      fadeOutMs: settings.fade_out_ms,
    });

    const cached = await MixedAudioCache.findOne({ where: { hash } });
    if (cached) {
      logger.info("BackgroundTrackMixService: cache hit", { contentId: content.id, hash });
      // Persist on content so next call is free
      await Content.update({ mixed_audio_url: cached.url }, { where: { id: content.id } });
      return cached.url;
    }

    // 4. Create temp workspace
    const tmpDir = path.join(os.tmpdir(), `bg-mix-${hash.slice(0, 12)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const voicePath = path.join(tmpDir, "voice.mp3");
    const trackPath = path.join(tmpDir, "track.mp3");
    const outPath = path.join(tmpDir, "mixed.mp3");

    try {
      // 5. Download voice & track
      logger.info("BackgroundTrackMixService: downloading files", {
        contentId: content.id, voiceUrl: content.audio_url, trackUrl: track.url,
      });
      await Promise.all([
        downloadUrl(content.audio_url, voicePath),
        downloadUrl(track.url, trackPath),
      ]);

      // 6. Get voice duration
      const voiceDurationSec = await getAudioDurationSec(voicePath);

      // 7. ffmpeg
      await runFfmpegBackground({
        voicePath,
        trackPath,
        outPath,
        volumeBase: Number(settings.volume_base),
        duckingDb: settings.ducking_db,
        fadeInMs: settings.fade_in_ms,
        fadeOutMs: settings.fade_out_ms,
        voiceDurationSec,
      });

      // 8. Get output duration
      const duration_sec = Math.round(await getAudioDurationSec(outPath));

      // 9. Upload
      const storageKey = `audio/bg-mixed-${hash.slice(0, 16)}.mp3`;
      const mixedUrl = await storageProvider.upload(outPath, storageKey);

      const durationMs = Date.now() - t0;
      logger.info("BackgroundTrackMixService: mix complete", {
        contentId: content.id, mixedUrl, duration_sec, durationMs,
      });

      // 10. Cache in DB
      await MixedAudioCache.create({ hash, url: mixedUrl, duration_sec });

      // 11. Persist on content
      await Content.update({ mixed_audio_url: mixedUrl }, { where: { id: content.id } });

      return mixedUrl;
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  /** Invalidate all cached mixes for a background track or settings change. */
  async invalidateCacheForTrack(trackId: string): Promise<number> {
    // We can't easily filter by trackId without a separate index, so purge all
    // OR: add a track_id column to mixed_audio_cache (future improvement)
    // For now, delete all — safe because mixes are re-generated on demand
    const deleted = await MixedAudioCache.destroy({ where: {} });
    // Also clear mixed_audio_url on all contents using this track
    await Content.update(
      { mixed_audio_url: null },
      { where: { background_track_id: trackId } as Record<string, unknown> },
    );
    logger.info("BackgroundTrackMixService: cache invalidated for track", { trackId, deleted });
    return deleted;
  }

  /** Invalidate all caches for a settings type. */
  async invalidateCacheForType(contentType: string): Promise<number> {
    const deleted = await MixedAudioCache.destroy({ where: {} });
    // Clear mixed_audio_url on all contents of this type
    await Content.update(
      { mixed_audio_url: null },
      { where: { tipo: contentType } as Record<string, unknown> },
    );
    logger.info("BackgroundTrackMixService: cache invalidated for type", { contentType, deleted });
    return deleted;
  }

  private async selectTrack(
    content: { background_track_id?: string | null; tipo: string },
    settings: BackgroundTrackSettings,
  ): Promise<BackgroundTrack | null> {
    // Fixed track on content
    if (content.background_track_id) {
      return BackgroundTrack.findByPk(content.background_track_id);
    }

    // Random from category
    const category = settings.default_category ?? content.tipo;
    const tracks = await BackgroundTrack.findAll({
      where: { category } as Record<string, unknown>,
      attributes: ["id", "url", "name"],
    });

    if (tracks.length === 0) {
      // Fallback to generico
      const fallback = await BackgroundTrack.findAll({
        where: { category: "generico" } as Record<string, unknown>,
        attributes: ["id", "url", "name"],
      });
      if (fallback.length === 0) return null;
      return fallback[Math.floor(Math.random() * fallback.length)]!;
    }

    return tracks[Math.floor(Math.random() * tracks.length)]!;
  }
}

export const backgroundTrackMixService = new BackgroundTrackMixService();

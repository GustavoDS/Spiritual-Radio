import crypto from "crypto";
import { Op } from "sequelize";
import { logger } from "../lib/logger.js";
import {
  Channel,
  Content,
  Playlist,
  PlaylistItem,
  RadioPlay,
} from "../models/index.js";
import { realtimeService } from "./RealtimeService.js";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface TrackInfo {
  contentId: number;
  titulo: string;
  tipo: string;
  audioUrl: string | null;
  artworkUrl: string | null;
  duracao: number; // seconds (0 = unknown, defaults to 300)
  channelId: number;
  ordem: number;
}

export interface ChannelDJState {
  channelId: number;
  queue: TrackInfo[];
  currentIndex: number;
  playingSince: Date | null;
  isPlaying: boolean;
  lastQueueLoad: Date | null;
  listenerCount: number;
  peakListeners: number;
  totalPlays: number;
  fallbackMode: boolean;
}

export interface NowPlayingInfo {
  current: TrackInfo | null;
  next: TrackInfo | null;
  upNext: TrackInfo[];
  isPlaying: boolean;
  startedAt: string | null;
  progressSec: number;
  remainingSec: number;
  listenerCount: number;
}

/* ─── Constants ─────────────────────────────────────────────────────────── */

const QUEUE_MIN_SIZE = 10;
const QUEUE_RELOAD_THRESHOLD = 3;
const DEFAULT_TRACK_DURATION = 300; // 5 min fallback
const WATCHER_INTERVAL_MS = 5_000;  // check every 5s
const QUEUE_RELOAD_INTERVAL_MS = 5 * 60 * 1000; // reload queue every 5 min
const FALLBACK_CONTENT_LIMIT = 20;

/* ─── AutoDJService ──────────────────────────────────────────────────────── */

export class AutoDJService {
  private states = new Map<number, ChannelDJState>();
  private watcher: NodeJS.Timeout | null = null;
  private isWatcherRunning = false;

  /* ── Queue building ─────────────────────────────────────────────────── */

  private async buildQueueFromPlaylist(channelId: number): Promise<TrackInfo[]> {
    const today = new Date().toISOString().split("T")[0]!;
    const playlist = await Playlist.findOne({
      where: { channel_id: channelId, data: today },
    });
    if (!playlist) return [];

    const items = await PlaylistItem.findAll({
      where: { playlist_id: playlist.id, content_id: { [Op.ne]: null } },
      include: [{ model: Content, as: "content" }],
      order: [["ordem", "ASC"]],
    });

    return items
      .map((item) => {
        const content = (item as unknown as { content: Content | null }).content;
        if (!content || !content.ativo) return null;
        return {
          contentId: content.id,
          titulo: content.titulo,
          tipo: content.tipo,
          audioUrl: content.audio_url ?? null,
          artworkUrl: content.imagem_url ?? null,
          duracao: content.duracao ?? DEFAULT_TRACK_DURATION,
          channelId,
          ordem: item.ordem,
        } satisfies TrackInfo;
      })
      .filter((t): t is TrackInfo => t !== null);
  }

  private async buildQueueFromFallback(channelId: number): Promise<TrackInfo[]> {
    // Fallback: latest active contents for this channel with audio
    const contents = await Content.findAll({
      where: {
        channel_id: channelId,
        ativo: true,
        audio_url: { [Op.ne]: null },
      },
      order: [["createdAt", "DESC"]],
      limit: FALLBACK_CONTENT_LIMIT,
    });

    if (contents.length === 0) {
      // Last resort: any active content across all channels
      const any = await Content.findAll({
        where: { ativo: true, audio_url: { [Op.ne]: null } },
        order: [["createdAt", "DESC"]],
        limit: FALLBACK_CONTENT_LIMIT,
      });
      return any.map((c, i) => toTrackInfo(c, channelId, i));
    }

    // Shuffle fallback for variety
    const shuffled = [...contents].sort(() => Math.random() - 0.5);
    return shuffled.map((c, i) => toTrackInfo(c, channelId, i));
  }

  async buildQueue(channelId: number): Promise<{ tracks: TrackInfo[]; fallback: boolean }> {
    const playlist = await this.buildQueueFromPlaylist(channelId);
    const audioTracks = playlist.filter((t) => t.audioUrl);
    if (audioTracks.length > 0) {
      return { tracks: audioTracks, fallback: false };
    }

    logger.info("AutoDJService: playlist empty or no audio — using fallback", { channelId });
    const fallback = await this.buildQueueFromFallback(channelId);
    return { tracks: fallback, fallback: true };
  }

  /* ── State management ───────────────────────────────────────────────── */

  private getOrCreateState(channelId: number): ChannelDJState {
    if (!this.states.has(channelId)) {
      this.states.set(channelId, {
        channelId,
        queue: [],
        currentIndex: 0,
        playingSince: null,
        isPlaying: false,
        lastQueueLoad: null,
        listenerCount: 0,
        peakListeners: 0,
        totalPlays: 0,
        fallbackMode: false,
      });
    }
    return this.states.get(channelId)!;
  }

  async initChannel(channelId: number): Promise<void> {
    const state = this.getOrCreateState(channelId);
    const { tracks, fallback } = await this.buildQueue(channelId);

    state.queue = tracks;
    state.currentIndex = 0;
    state.fallbackMode = fallback;
    state.lastQueueLoad = new Date();

    if (tracks.length > 0) {
      state.isPlaying = true;
      state.playingSince = new Date();
      state.totalPlays++;
      logger.info("AutoDJService: channel initialized", {
        channelId,
        tracks: tracks.length,
        fallback,
        firstTrack: tracks[0]?.titulo,
      });
    } else {
      state.isPlaying = false;
      state.playingSince = null;
      logger.warn("AutoDJService: channel has no playable content", { channelId });
    }
  }

  /* ── Track advancement ──────────────────────────────────────────────── */

  private async advance(channelId: number): Promise<void> {
    const state = this.states.get(channelId);
    if (!state) return;

    const prevTrack = state.queue[state.currentIndex];
    state.currentIndex = (state.currentIndex + 1) % Math.max(state.queue.length, 1);

    // Reload queue if running low
    if (state.queue.length - state.currentIndex <= QUEUE_RELOAD_THRESHOLD) {
      const { tracks, fallback } = await this.buildQueue(channelId);
      if (tracks.length > 0) {
        // Append new tracks, avoiding duplicates with the remaining queue
        const remaining = state.queue.slice(state.currentIndex);
        const remainingIds = new Set(remaining.map((t) => t.contentId));
        const newTracks = tracks.filter((t) => !remainingIds.has(t.contentId));
        state.queue = [...remaining, ...newTracks];
        state.currentIndex = 0;
        state.fallbackMode = fallback;
        state.lastQueueLoad = new Date();
      }
    }

    const current = state.queue[state.currentIndex] ?? null;
    const next = state.queue[state.currentIndex + 1] ?? null;

    if (current) {
      state.playingSince = new Date();
      state.isPlaying = true;
      state.totalPlays++;

      // Record RadioPlay (non-blocking)
      RadioPlay.create({
        channel_id: channelId,
        content_id: current.contentId,
        titulo: current.titulo,
        tipo: current.tipo,
        played_at: new Date(),
      }).catch((err) =>
        logger.debug("AutoDJService: RadioPlay.create failed", { err: (err as Error).message }),
      );

      // SSE broadcast
      realtimeService.broadcastPublic("current_track_changed", {
        channelId,
        current: { id: current.contentId, titulo: current.titulo, audioUrl: current.audioUrl, artworkUrl: current.artworkUrl },
        next: next ? { id: next.contentId, titulo: next.titulo } : null,
        ts: new Date().toISOString(),
        source: "autodj",
      });

      if (next) {
        realtimeService.broadcastPublic("next_track_changed", {
          channelId,
          next: { id: next.contentId, titulo: next.titulo },
          ts: new Date().toISOString(),
        });
      }

      realtimeService.broadcastPublic("radio_online", { channelId, ts: new Date().toISOString() });

      logger.debug("AutoDJService: advanced to next track", {
        channelId,
        prev: prevTrack?.titulo,
        current: current.titulo,
        duracao: current.duracao,
      });
    } else {
      state.isPlaying = false;
      state.playingSince = null;
      realtimeService.broadcastPublic("radio_offline", { channelId, ts: new Date().toISOString() });
      logger.warn("AutoDJService: channel out of content", { channelId });
    }
  }

  /* ── Watcher (timer) ────────────────────────────────────────────────── */

  startWatcher(): void {
    if (this.watcher) return;

    this.watcher = setInterval(async () => {
      if (this.isWatcherRunning) return;
      this.isWatcherRunning = true;
      try {
        await this.tick();
      } catch (err) {
        logger.debug("AutoDJService watcher error", { err: (err as Error).message });
      } finally {
        this.isWatcherRunning = false;
      }
    }, WATCHER_INTERVAL_MS);

    if ((this.watcher as NodeJS.Timeout).unref) {
      (this.watcher as NodeJS.Timeout).unref();
    }

    logger.info("AutoDJService: watcher started", { intervalMs: WATCHER_INTERVAL_MS });
  }

  stopWatcher(): void {
    if (this.watcher) {
      clearInterval(this.watcher);
      this.watcher = null;
      logger.info("AutoDJService: watcher stopped");
    }
  }

  private async tick(): Promise<void> {
    const now = Date.now();

    // Ensure all active channels are initialized
    let channels: { id: number }[] = [];
    try {
      channels = await Channel.findAll({ where: { ativo: true }, attributes: ["id"] });
    } catch {
      return;
    }

    for (const ch of channels) {
      const state = this.states.get(ch.id);

      // Initialize channel if not yet done
      if (!state || state.queue.length === 0) {
        await this.initChannel(ch.id).catch(() => {});
        continue;
      }

      // Reload queue periodically even if not empty
      if (
        state.lastQueueLoad &&
        now - state.lastQueueLoad.getTime() > QUEUE_RELOAD_INTERVAL_MS &&
        state.queue.length <= QUEUE_MIN_SIZE
      ) {
        await this.initChannel(ch.id).catch(() => {});
        continue;
      }

      if (!state.isPlaying || !state.playingSince) continue;

      const current = state.queue[state.currentIndex];
      if (!current) {
        await this.initChannel(ch.id).catch(() => {});
        continue;
      }

      const elapsed = (now - state.playingSince.getTime()) / 1000;
      const effectiveDuration = current.duracao > 0 ? current.duracao : DEFAULT_TRACK_DURATION;

      if (elapsed >= effectiveDuration) {
        await this.advance(ch.id).catch((err) =>
          logger.debug("AutoDJService: advance failed", { channelId: ch.id, err: (err as Error).message }),
        );
      }
    }
  }

  /* ── Public getters ─────────────────────────────────────────────────── */

  getNowPlaying(channelId: number): NowPlayingInfo {
    const state = this.states.get(channelId);
    if (!state || !state.isPlaying || state.queue.length === 0) {
      return { current: null, next: null, upNext: [], isPlaying: false, startedAt: null, progressSec: 0, remainingSec: 0, listenerCount: 0 };
    }

    const current = state.queue[state.currentIndex] ?? null;
    const next = state.queue[state.currentIndex + 1] ?? null;
    const upNext = state.queue.slice(state.currentIndex + 2, state.currentIndex + 6);

    const progressSec = state.playingSince
      ? Math.floor((Date.now() - state.playingSince.getTime()) / 1000)
      : 0;
    const duracao = current ? (current.duracao > 0 ? current.duracao : DEFAULT_TRACK_DURATION) : 0;
    const remainingSec = Math.max(0, duracao - progressSec);

    return {
      current,
      next,
      upNext,
      isPlaying: state.isPlaying,
      startedAt: state.playingSince?.toISOString() ?? null,
      progressSec,
      remainingSec,
      listenerCount: state.listenerCount,
    };
  }

  getQueue(channelId: number, count = 10): TrackInfo[] {
    const state = this.states.get(channelId);
    if (!state) return [];
    return state.queue.slice(state.currentIndex, state.currentIndex + count);
  }

  getAllChannelStates(): ChannelDJState[] {
    return Array.from(this.states.values());
  }

  getChannelState(channelId: number): ChannelDJState | null {
    return this.states.get(channelId) ?? null;
  }

  /* ── Listener tracking ──────────────────────────────────────────────── */

  incrementListeners(channelId: number): void {
    const state = this.getOrCreateState(channelId);
    state.listenerCount = Math.max(0, state.listenerCount + 1);
    if (state.listenerCount > state.peakListeners) {
      state.peakListeners = state.listenerCount;
    }
  }

  decrementListeners(channelId: number): void {
    const state = this.states.get(channelId);
    if (state) state.listenerCount = Math.max(0, state.listenerCount - 1);
  }

  /* ── Control ────────────────────────────────────────────────────────── */

  async restart(channelId: number): Promise<void> {
    const state = this.states.get(channelId);
    if (state) {
      state.queue = [];
      state.currentIndex = 0;
      state.playingSince = null;
      state.isPlaying = false;
    }
    await this.initChannel(channelId);
  }

  async reload(channelId: number): Promise<void> {
    const state = this.getOrCreateState(channelId);
    const { tracks, fallback } = await this.buildQueue(channelId);
    if (tracks.length > 0) {
      // Keep current track, reload the rest
      const current = state.queue[state.currentIndex];
      state.queue = current ? [current, ...tracks.filter((t) => t.contentId !== current.contentId)] : tracks;
      state.currentIndex = 0;
      state.fallbackMode = fallback;
      state.lastQueueLoad = new Date();
      logger.info("AutoDJService: queue reloaded", { channelId, tracks: tracks.length });
    }
  }
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function toTrackInfo(c: Content, channelId: number, ordem: number): TrackInfo {
  return {
    contentId: c.id,
    titulo: c.titulo,
    tipo: c.tipo,
    audioUrl: c.audio_url ?? null,
    artworkUrl: c.imagem_url ?? null,
    duracao: c.duracao ?? DEFAULT_TRACK_DURATION,
    channelId,
    ordem,
  };
}

export const autoDjService = new AutoDJService();

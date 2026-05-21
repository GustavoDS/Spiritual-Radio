import { Op } from "sequelize";
import { logger } from "../lib/logger.js";
import { Channel, Content, Playlist, PlaylistItem, RadioPlay } from "../models/index.js";
import { realtimeService } from "./RealtimeService.js";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface TrackInfo {
  contentId: number;
  titulo: string;
  tipo: string;
  audioUrl: string | null;
  artworkUrl: string | null;
  duracao: number;           // seconds
  channelId: number;
  ordem: number;
  horaExecucao: string | null;  // "HH:MM:SS" — schedule slot time
  startedAt: string | null;     // ISO — when block started / will start
  endsAt: string | null;        // ISO — when block ends / next block starts
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
  scheduleMode: boolean;
  offlineReason: "no_schedule" | "between_blocks" | null;
  nextStartsAt: string | null;
  blockEndsAt: string | null;
  pendingNext: TrackInfo | null;  // next scheduled block (for offline state)
}

export interface NowPlayingInfo {
  current: TrackInfo | null;
  next: TrackInfo | null;
  upNext: TrackInfo[];
  isPlaying: boolean;
  scheduleMode: boolean;
  startedAt: string | null;
  endsAt: string | null;
  progressSec: number;
  remainingSec: number;
  listenerCount: number;
  offlineReason: "no_schedule" | "between_blocks" | null;
  nextStartsAt: string | null;
}

/* ─── Constants ─────────────────────────────────────────────────────────── */

const QUEUE_RELOAD_THRESHOLD = 3;
const QUEUE_MIN_SIZE = 10;
const DEFAULT_TRACK_DURATION = 300;  // 5 min
const WATCHER_INTERVAL_MS = 5_000;
const QUEUE_RELOAD_INTERVAL_MS = 5 * 60 * 1000;
const FALLBACK_CONTENT_LIMIT = 20;

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function currentTimeStr(): string {
  const now = new Date();
  return [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join(":");
}

/** Convert "HH:MM:SS" (local server time) to a Date for today. */
function timeStrToDate(timeStr: string): Date {
  const [h = 0, m = 0, s = 0] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, s, 0);
  return d;
}

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
    horaExecucao: null,
    startedAt: null,
    endsAt: null,
  };
}

type PlaylistItemWithContent = PlaylistItem & { content: Content | null };

/* ─── AutoDJService ──────────────────────────────────────────────────────── */

export class AutoDJService {
  private states = new Map<number, ChannelDJState>();
  private watcher: NodeJS.Timeout | null = null;
  private isWatcherRunning = false;

  /* ── State ──────────────────────────────────────────────────────────── */

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
        scheduleMode: false,
        offlineReason: null,
        nextStartsAt: null,
        blockEndsAt: null,
        pendingNext: null,
      });
    }
    return this.states.get(channelId)!;
  }

  /* ── Queue building ─────────────────────────────────────────────────── */

  async buildQueue(channelId: number): Promise<{ tracks: TrackInfo[]; fallback: boolean; scheduleMode: boolean }> {
    const today = new Date().toISOString().split("T")[0]!;
    const playlist = await Playlist.findOne({ where: { channel_id: channelId, data: today } });

    if (playlist) {
      const items = (await PlaylistItem.findAll({
        where: { playlist_id: playlist.id, content_id: { [Op.ne]: null } },
        include: [{ model: Content, as: "content" }],
        order: [["hora_execucao", "ASC"], ["ordem", "ASC"]],
      })) as PlaylistItemWithContent[];

      // Schedule mode: playlist has time slots
      const hasSchedule = items.some((i) => i.hora_execucao !== null);

      if (hasSchedule) {
        const tracks = items
          .map((item) => {
            const c = item.content;
            if (!c) return null;
            return {
              contentId: c.id,
              titulo: c.titulo,
              tipo: c.tipo,
              audioUrl: c.audio_url ?? null,
              artworkUrl: c.imagem_url ?? null,
              duracao: c.duracao ?? DEFAULT_TRACK_DURATION,
              channelId,
              ordem: item.ordem,
              horaExecucao: item.hora_execucao,
              startedAt: item.hora_execucao ? timeStrToDate(item.hora_execucao).toISOString() : null,
              endsAt: null as string | null,
            };
          })
          .filter((t): t is TrackInfo => t !== null);
        return { tracks, fallback: false, scheduleMode: true };
      }

      // Continuous mode: playlist without time slots
      const audioTracks = items
        .map((item) => {
          const c = item.content;
          if (!c || !c.ativo || !c.audio_url) return null;
          return {
            contentId: c.id,
            titulo: c.titulo,
            tipo: c.tipo,
            audioUrl: c.audio_url as string | null,
            artworkUrl: c.imagem_url ?? null,
            duracao: c.duracao ?? DEFAULT_TRACK_DURATION,
            channelId,
            ordem: item.ordem,
            horaExecucao: null as string | null,
            startedAt: null as string | null,
            endsAt: null as string | null,
          };
        })
        .filter((t): t is TrackInfo => t !== null);

      if (audioTracks.length > 0) {
        return { tracks: audioTracks, fallback: false, scheduleMode: false };
      }
    }

    // Fallback: latest contents with audio for this channel
    logger.info("AutoDJService: no scheduled playlist — using fallback", { channelId });
    const fallback = await this.buildFallbackTracks(channelId);
    return { tracks: fallback, fallback: true, scheduleMode: false };
  }

  private async buildFallbackTracks(channelId: number): Promise<TrackInfo[]> {
    const contents = await Content.findAll({
      where: { channel_id: channelId, ativo: true, audio_url: { [Op.ne]: null } },
      order: [["createdAt", "DESC"]],
      limit: FALLBACK_CONTENT_LIMIT,
    });
    if (contents.length > 0) {
      return [...contents].sort(() => Math.random() - 0.5).map((c, i) => toTrackInfo(c, channelId, i));
    }
    // Last resort: any active content
    const any = await Content.findAll({
      where: { ativo: true, audio_url: { [Op.ne]: null } },
      order: [["createdAt", "DESC"]],
      limit: FALLBACK_CONTENT_LIMIT,
    });
    return any.map((c, i) => toTrackInfo(c, channelId, i));
  }

  /* ── Init ───────────────────────────────────────────────────────────── */

  async initChannel(channelId: number): Promise<void> {
    const state = this.getOrCreateState(channelId);
    const { tracks, fallback, scheduleMode } = await this.buildQueue(channelId);

    state.scheduleMode = scheduleMode;
    state.fallbackMode = fallback;
    state.lastQueueLoad = new Date();

    if (scheduleMode) {
      state.queue = tracks;
      state.currentIndex = 0;
      // tickScheduleMode handles actual playback state
      logger.info("AutoDJService: channel in schedule mode", { channelId, slots: tracks.length });
    } else if (tracks.length > 0) {
      state.queue = tracks;
      state.currentIndex = 0;
      state.isPlaying = true;
      state.playingSince = new Date();
      state.offlineReason = null;
      state.pendingNext = null;
      state.totalPlays++;

      // Set startedAt / endsAt on the first track so getNowPlaying returns them immediately
      const first = tracks[0]!;
      first.startedAt = state.playingSince.toISOString();
      first.endsAt = new Date(
        state.playingSince.getTime() + (first.duracao > 0 ? first.duracao : DEFAULT_TRACK_DURATION) * 1000,
      ).toISOString();
      state.blockEndsAt = first.endsAt;

      logger.info("AutoDJService: channel in continuous mode", { channelId, tracks: tracks.length, first: first.titulo });
    } else {
      state.isPlaying = false;
      state.playingSince = null;
      state.offlineReason = "no_schedule";
      logger.warn("AutoDJService: channel has no playable content", { channelId });
    }
  }

  /* ── Offline helper ─────────────────────────────────────────────────── */

  private setOffline(
    channelId: number,
    state: ChannelDJState,
    reason: "no_schedule" | "between_blocks",
    nextStartsAt: string | null,
    pendingNext: TrackInfo | null,
  ): void {
    const wasPlaying = state.isPlaying;
    state.isPlaying = false;
    state.playingSince = null;
    state.blockEndsAt = null;
    state.offlineReason = reason;
    state.nextStartsAt = nextStartsAt;
    state.pendingNext = pendingNext;

    if (wasPlaying) {
      realtimeService.broadcastPublic("radio_offline", {
        channelId,
        offlineReason: reason,
        nextStartsAt,
        ts: new Date().toISOString(),
      });
      logger.info("AutoDJService: channel went offline", { channelId, reason, nextStartsAt });
    }
  }

  /* ── Schedule-aware tick ────────────────────────────────────────────── */

  private async tickScheduleMode(channelId: number, state: ChannelDJState): Promise<void> {
    const today = new Date().toISOString().split("T")[0]!;
    const nowStr = currentTimeStr();

    const playlist = await Playlist.findOne({ where: { channel_id: channelId, data: today } });
    if (!playlist) {
      this.setOffline(channelId, state, "no_schedule", null, null);
      return;
    }

    const [currentItem, nextItem] = (await Promise.all([
      // Most recent block that has started
      PlaylistItem.findOne({
        where: { playlist_id: playlist.id, hora_execucao: { [Op.lte]: nowStr } },
        include: [{ model: Content, as: "content" }],
        order: [["hora_execucao", "DESC"]],
      }),
      // Earliest upcoming block with content
      PlaylistItem.findOne({
        where: { playlist_id: playlist.id, hora_execucao: { [Op.gt]: nowStr }, content_id: { [Op.ne]: null } },
        include: [{ model: Content, as: "content" }],
        order: [["hora_execucao", "ASC"]],
      }),
    ])) as [PlaylistItemWithContent | null, PlaylistItemWithContent | null];

    const nextStartsAt = nextItem?.hora_execucao
      ? timeStrToDate(nextItem.hora_execucao).toISOString()
      : null;

    // Build pendingNext (preview of next block, available even offline)
    let pendingNext: TrackInfo | null = null;
    if (nextItem?.content) {
      const nc = nextItem.content;
      pendingNext = {
        contentId: nc.id,
        titulo: nc.titulo,
        tipo: nc.tipo,
        audioUrl: nc.audio_url ?? null,
        artworkUrl: nc.imagem_url ?? null,
        duracao: nc.duracao ?? DEFAULT_TRACK_DURATION,
        channelId,
        ordem: nextItem.ordem,
        horaExecucao: nextItem.hora_execucao,
        startedAt: nextStartsAt,
        endsAt: null,
      };
    }

    // No current block, or current block has no audio
    if (!currentItem || !currentItem.content_id || !currentItem.content?.audio_url) {
      this.setOffline(channelId, state, "between_blocks", nextStartsAt, pendingNext);
      return;
    }

    const content = currentItem.content!;

    // Already playing this exact block? Just refresh endsAt and next
    const active = state.queue[state.currentIndex];
    if (state.isPlaying && active?.horaExecucao === currentItem.hora_execucao && active.contentId === content.id) {
      const newEndsAt = nextItem?.hora_execucao
        ? timeStrToDate(nextItem.hora_execucao).toISOString()
        : state.blockEndsAt;
      if (newEndsAt && active.endsAt !== newEndsAt) {
        active.endsAt = newEndsAt;
        state.blockEndsAt = newEndsAt;
      }
      state.nextStartsAt = nextStartsAt;
      state.pendingNext = pendingNext;
      return;
    }

    // New block started — transition
    const wasPlaying = state.isPlaying;
    const playingSince = timeStrToDate(currentItem.hora_execucao!);
    const endsAt = nextItem?.hora_execucao
      ? timeStrToDate(nextItem.hora_execucao).toISOString()
      : new Date(playingSince.getTime() + (content.duracao ?? DEFAULT_TRACK_DURATION) * 1000).toISOString();

    const track: TrackInfo = {
      contentId: content.id,
      titulo: content.titulo,
      tipo: content.tipo,
      audioUrl: content.audio_url ?? null,
      artworkUrl: content.imagem_url ?? null,
      duracao: content.duracao ?? DEFAULT_TRACK_DURATION,
      channelId,
      ordem: currentItem.ordem,
      horaExecucao: currentItem.hora_execucao,
      startedAt: playingSince.toISOString(),
      endsAt,
    };

    state.queue = pendingNext ? [track, pendingNext] : [track];
    state.currentIndex = 0;
    state.isPlaying = true;
    state.playingSince = playingSince;
    state.offlineReason = null;
    state.blockEndsAt = endsAt;
    state.nextStartsAt = nextStartsAt;
    state.pendingNext = pendingNext;
    state.totalPlays++;
    state.lastQueueLoad = new Date();

    // Record RadioPlay (non-blocking)
    RadioPlay.create({
      channel_id: channelId,
      content_id: content.id,
      titulo: content.titulo,
      tipo: content.tipo,
      played_at: playingSince,
    }).catch(() => {});

    const ts = new Date().toISOString();

    if (!wasPlaying) {
      realtimeService.broadcastPublic("radio_online", {
        channelId,
        ts,
        currentTrack: { id: content.id, titulo: content.titulo },
      });
    }

    realtimeService.broadcastPublic("current_track_changed", {
      channelId,
      current: {
        id: content.id,
        titulo: content.titulo,
        audioUrl: content.audio_url,
        artworkUrl: content.imagem_url,
        startedAt: track.startedAt,
        endsAt: track.endsAt,
      },
      next: pendingNext
        ? { id: pendingNext.contentId, titulo: pendingNext.titulo, startedAt: pendingNext.startedAt }
        : null,
      ts,
      source: "schedule",
    });

    logger.info("AutoDJService: schedule block started", {
      channelId,
      titulo: content.titulo,
      hora: currentItem.hora_execucao,
      endsAt,
    });
  }

  /* ── Continuous mode tick ───────────────────────────────────────────── */

  private async tickContinuousMode(channelId: number, state: ChannelDJState): Promise<void> {
    if (state.queue.length === 0) {
      await this.initChannel(channelId);
      return;
    }

    if (
      state.lastQueueLoad &&
      Date.now() - state.lastQueueLoad.getTime() > QUEUE_RELOAD_INTERVAL_MS &&
      state.queue.length <= QUEUE_MIN_SIZE
    ) {
      await this.initChannel(channelId);
      return;
    }

    if (!state.isPlaying || !state.playingSince) return;

    const current = state.queue[state.currentIndex];
    if (!current) { await this.initChannel(channelId); return; }

    const elapsed = (Date.now() - state.playingSince.getTime()) / 1000;
    const effectiveDuration = current.duracao > 0 ? current.duracao : DEFAULT_TRACK_DURATION;

    if (elapsed >= effectiveDuration) {
      await this.advanceContinuous(channelId, state);
    }
  }

  private async advanceContinuous(channelId: number, state: ChannelDJState): Promise<void> {
    state.currentIndex = (state.currentIndex + 1) % Math.max(state.queue.length, 1);

    if (state.queue.length - state.currentIndex <= QUEUE_RELOAD_THRESHOLD) {
      const { tracks } = await this.buildQueue(channelId);
      if (tracks.length > 0) {
        const remaining = state.queue.slice(state.currentIndex);
        const remainingIds = new Set(remaining.map((t) => t.contentId));
        state.queue = [...remaining, ...tracks.filter((t) => !remainingIds.has(t.contentId))];
        state.currentIndex = 0;
        state.lastQueueLoad = new Date();
      }
    }

    const current = state.queue[state.currentIndex] ?? null;
    const next = state.queue[state.currentIndex + 1] ?? null;

    if (current) {
      state.playingSince = new Date();
      state.isPlaying = true;
      state.offlineReason = null;
      state.totalPlays++;

      const endsAt = new Date(
        state.playingSince.getTime() + (current.duracao > 0 ? current.duracao : DEFAULT_TRACK_DURATION) * 1000,
      ).toISOString();
      current.startedAt = state.playingSince.toISOString();
      current.endsAt = endsAt;

      RadioPlay.create({
        channel_id: channelId,
        content_id: current.contentId,
        titulo: current.titulo,
        tipo: current.tipo,
        played_at: state.playingSince,
      }).catch(() => {});

      const ts = new Date().toISOString();
      realtimeService.broadcastPublic("radio_online", { channelId, ts });
      realtimeService.broadcastPublic("current_track_changed", {
        channelId,
        current: { id: current.contentId, titulo: current.titulo, audioUrl: current.audioUrl, artworkUrl: current.artworkUrl, startedAt: current.startedAt, endsAt: current.endsAt },
        next: next ? { id: next.contentId, titulo: next.titulo } : null,
        ts,
        source: "autodj",
      });
    } else {
      state.isPlaying = false;
      state.playingSince = null;
      state.offlineReason = "no_schedule";
      realtimeService.broadcastPublic("radio_offline", {
        channelId,
        offlineReason: "no_schedule",
        nextStartsAt: null,
        ts: new Date().toISOString(),
      });
      logger.warn("AutoDJService: channel out of content", { channelId });
    }
  }

  /* ── Watcher ────────────────────────────────────────────────────────── */

  startWatcher(): void {
    if (this.watcher) return;
    this.watcher = setInterval(async () => {
      if (this.isWatcherRunning) return;
      this.isWatcherRunning = true;
      try { await this.tick(); }
      catch (err) { logger.debug("AutoDJService watcher error", { err: (err as Error).message }); }
      finally { this.isWatcherRunning = false; }
    }, WATCHER_INTERVAL_MS);
    if ((this.watcher as NodeJS.Timeout).unref) (this.watcher as NodeJS.Timeout).unref();
    logger.info("AutoDJService: watcher started", { intervalMs: WATCHER_INTERVAL_MS });
  }

  stopWatcher(): void {
    if (this.watcher) { clearInterval(this.watcher); this.watcher = null; }
  }

  private async tick(): Promise<void> {
    let channels: { id: number }[] = [];
    try { channels = await Channel.findAll({ where: { ativo: true }, attributes: ["id"] }); }
    catch { return; }

    for (const ch of channels) {
      const state = this.states.get(ch.id);

      if (!state) {
        await this.initChannel(ch.id).catch(() => {});
        continue;
      }

      if (state.scheduleMode) {
        await this.tickScheduleMode(ch.id, state).catch((err) =>
          logger.debug("AutoDJService: tickScheduleMode failed", { channelId: ch.id, err: (err as Error).message }),
        );
      } else {
        await this.tickContinuousMode(ch.id, state).catch((err) =>
          logger.debug("AutoDJService: tickContinuousMode failed", { channelId: ch.id, err: (err as Error).message }),
        );
      }
    }
  }

  /* ── Public getters ─────────────────────────────────────────────────── */

  getNowPlaying(channelId: number): NowPlayingInfo {
    const state = this.states.get(channelId);

    if (!state || !state.isPlaying) {
      return {
        current: null,
        next: state?.pendingNext ?? null,
        upNext: [],
        isPlaying: false,
        scheduleMode: state?.scheduleMode ?? false,
        startedAt: null,
        endsAt: null,
        progressSec: 0,
        remainingSec: 0,
        listenerCount: state?.listenerCount ?? 0,
        offlineReason: state?.offlineReason ?? "no_schedule",
        nextStartsAt: state?.nextStartsAt ?? null,
      };
    }

    const current = state.queue[state.currentIndex] ?? null;
    const next = state.queue[state.currentIndex + 1] ?? state.pendingNext ?? null;
    const upNext = state.queue.slice(state.currentIndex + 2, state.currentIndex + 6);

    const progressSec = state.playingSince
      ? Math.floor((Date.now() - state.playingSince.getTime()) / 1000)
      : 0;
    const duracao = current ? (current.duracao > 0 ? current.duracao : DEFAULT_TRACK_DURATION) : 0;
    const remainingSec = Math.max(0, duracao - progressSec);
    const endsAt = state.blockEndsAt ?? current?.endsAt ?? null;

    return {
      current,
      next,
      upNext,
      isPlaying: true,
      scheduleMode: state.scheduleMode,
      startedAt: state.playingSince?.toISOString() ?? null,
      endsAt,
      progressSec,
      remainingSec,
      listenerCount: state.listenerCount,
      offlineReason: null,
      nextStartsAt: state.nextStartsAt,
    };
  }

  getQueue(channelId: number, count = 10): TrackInfo[] {
    const state = this.states.get(channelId);
    if (!state) return [];
    return state.queue.slice(state.currentIndex, state.currentIndex + count).filter((t) => !!t.audioUrl);
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
    if (state.listenerCount > state.peakListeners) state.peakListeners = state.listenerCount;
  }

  decrementListeners(channelId: number): void {
    const state = this.states.get(channelId);
    if (state) state.listenerCount = Math.max(0, state.listenerCount - 1);
  }

  /* ── Control ────────────────────────────────────────────────────────── */

  async restart(channelId: number): Promise<void> {
    const state = this.states.get(channelId);
    if (state) {
      Object.assign(state, {
        queue: [], currentIndex: 0, playingSince: null, isPlaying: false,
        scheduleMode: false, offlineReason: null, blockEndsAt: null, pendingNext: null,
      });
    }
    await this.initChannel(channelId);
  }

  async reload(channelId: number): Promise<void> {
    const state = this.getOrCreateState(channelId);
    const { tracks, fallback, scheduleMode } = await this.buildQueue(channelId);
    state.scheduleMode = scheduleMode;
    state.fallbackMode = fallback;
    state.lastQueueLoad = new Date();

    if (scheduleMode) {
      state.queue = tracks;
      state.currentIndex = 0;
    } else if (tracks.length > 0) {
      const current = state.queue[state.currentIndex];
      state.queue = current
        ? [current, ...tracks.filter((t) => t.contentId !== current.contentId)]
        : tracks;
      state.currentIndex = 0;
    }
    logger.info("AutoDJService: queue reloaded", { channelId, scheduleMode, tracks: tracks.length });
  }
}

export const autoDjService = new AutoDJService();

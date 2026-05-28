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
  duracao: number;
  channelId: number;
  ordem: number;
  horaExecucao: string | null;
  startedAt: string | null;
  endsAt: string | null;
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
  pendingNext: TrackInfo | null;
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

const DEFAULT_TRACK_DURATION = 300;
const WATCHER_INTERVAL_MS = 5_000;

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function currentTimeStr(): string {
  const now = new Date();
  return [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join(":");
}

/** "HH:MM:SS" (servidor local) → Date de hoje */
function timeStrToDate(timeStr: string): Date {
  const [h = 0, m = 0, s = 0] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, s, 0);
  return d;
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
        scheduleMode: true,
        offlineReason: "no_schedule",
        nextStartsAt: null,
        blockEndsAt: null,
        pendingNext: null,
      });
    }
    return this.states.get(channelId)!;
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
    state.queue = pendingNext ? [pendingNext] : [];
    state.currentIndex = 0;

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

  /* ── Schedule tick (source of truth) ────────────────────────────────── */

  private async tickScheduleMode(channelId: number, state: ChannelDJState): Promise<void> {
    const today = new Date().toISOString().split("T")[0]!;
    const nowStr = currentTimeStr();
    const now = new Date();

    // 1. Check playlist exists for today
    const playlist = await Playlist.findOne({ where: { channel_id: channelId, data: today } });
    if (!playlist) {
      this.setOffline(channelId, state, "no_schedule", null, null);
      return;
    }

    // Helper condition: has either a content or a vinheta audio
    const HAS_AUDIO = {
      [Op.or]: [
        { content_id: { [Op.ne]: null } },
        { vinheta_url: { [Op.ne]: null } },
      ],
    } as Record<symbol, unknown>;

    // 2. Next upcoming item (hora_execucao > now; content or vinheta)
    const nextItem = (await PlaylistItem.findOne({
      where: {
        playlist_id: playlist.id,
        hora_execucao: { [Op.gt]: nowStr },
        ...HAS_AUDIO,
      } as Record<string | symbol, unknown>,
      include: [{ model: Content, as: "content", required: false }],
      order: [["hora_execucao", "ASC"]],
    })) as PlaylistItemWithContent | null;

    const nextStartsAt = nextItem?.hora_execucao
      ? timeStrToDate(nextItem.hora_execucao).toISOString()
      : null;

    let pendingNext: TrackInfo | null = null;
    if (nextItem?.content) {
      const nc = nextItem.content;
      pendingNext = {
        contentId: nc.id,
        titulo: nc.titulo,
        tipo: nc.tipo,
        audioUrl: nc.mixed_audio_url ?? nc.audio_url ?? null,
        artworkUrl: nc.imagem_url ?? null,
        duracao: nc.duracao ?? DEFAULT_TRACK_DURATION,
        channelId,
        ordem: nextItem.ordem,
        horaExecucao: nextItem.hora_execucao,
        startedAt: nextStartsAt,
        endsAt: null,
      };
    } else if (nextItem?.vinheta_url) {
      pendingNext = {
        contentId: -(nextItem.id),
        titulo: nextItem.vinheta_titulo ?? "Vinheta",
        tipo: "vinheta",
        audioUrl: nextItem.vinheta_url,
        artworkUrl: null,
        duracao: nextItem.vinheta_duracao ?? 10,
        channelId,
        ordem: nextItem.ordem,
        horaExecucao: nextItem.hora_execucao,
        startedAt: nextStartsAt,
        endsAt: null,
      };
    }

    // 3. Most recently started item (hora_execucao <= now; content or vinheta)
    const candidate = (await PlaylistItem.findOne({
      where: {
        playlist_id: playlist.id,
        hora_execucao: { [Op.lte]: nowStr },
        ...HAS_AUDIO,
      } as Record<string | symbol, unknown>,
      include: [{ model: Content, as: "content", required: false }],
      order: [["hora_execucao", "DESC"]],
    })) as PlaylistItemWithContent | null;

    // 4. Verify the candidate is still active (block hasn't expired)
    let currentItem: PlaylistItemWithContent | null = null;
    if (candidate?.hora_execucao && (candidate.content || candidate.vinheta_url)) {
      const blockStart = timeStrToDate(candidate.hora_execucao);
      const duracao = candidate.content?.duracao ?? candidate.vinheta_duracao ?? DEFAULT_TRACK_DURATION;
      // End = next item's hora if available, else start + item duration
      const blockEndDate = nextItem?.hora_execucao
        ? timeStrToDate(nextItem.hora_execucao)
        : new Date(blockStart.getTime() + duracao * 1000);
      if (now < blockEndDate) currentItem = candidate;
    }

    // 5. No active item → offline
    const hasPlayableAudio = currentItem?.content?.audio_url || currentItem?.vinheta_url;
    if (!currentItem || !hasPlayableAudio) {
      const reason = candidate ? "between_blocks" : "no_schedule";
      this.setOffline(channelId, state, reason, nextStartsAt, pendingNext);
      return;
    }

    // Distinguish vinheta vs content item
    const isVinhetaItem = !currentItem.content_id && !!currentItem.vinheta_url;
    const content = isVinhetaItem ? null : currentItem.content;

    // 6. Compute timing
    const playingSince = timeStrToDate(currentItem.hora_execucao!);
    const itemDuracao = content?.duracao ?? currentItem.vinheta_duracao ?? DEFAULT_TRACK_DURATION;
    const blockEndDate = nextItem?.hora_execucao
      ? timeStrToDate(nextItem.hora_execucao)
      : new Date(playingSince.getTime() + itemDuracao * 1000);
    const endsAt = blockEndDate.toISOString();

    // Stable identifier: positive for content, negative (row id) for vinheta
    const currentTrackId = isVinhetaItem ? -(currentItem.id) : (content?.id ?? 0);

    // 7. Already playing this exact item? Just refresh timing
    const active = state.queue[state.currentIndex];
    if (
      state.isPlaying &&
      active?.horaExecucao === currentItem.hora_execucao &&
      active.contentId === currentTrackId
    ) {
      if (active.endsAt !== endsAt) { active.endsAt = endsAt; state.blockEndsAt = endsAt; }
      state.nextStartsAt = nextStartsAt;
      state.pendingNext = pendingNext;
      if (pendingNext && state.queue.length < 2) state.queue = [active, pendingNext];
      return;
    }

    // 8. New item — transition
    const wasPlaying = state.isPlaying;

    const track: TrackInfo = isVinhetaItem
      ? {
          contentId: currentTrackId,
          titulo: currentItem.vinheta_titulo ?? "Vinheta",
          tipo: "vinheta",
          audioUrl: currentItem.vinheta_url!,
          artworkUrl: null,
          duracao: currentItem.vinheta_duracao ?? 10,
          channelId,
          ordem: currentItem.ordem,
          horaExecucao: currentItem.hora_execucao,
          startedAt: playingSince.toISOString(),
          endsAt,
        }
      : {
          contentId: content!.id,
          titulo: content!.titulo,
          tipo: content!.tipo,
          audioUrl: content!.mixed_audio_url ?? content!.audio_url ?? null,
          artworkUrl: content!.imagem_url ?? null,
          duracao: content!.duracao ?? DEFAULT_TRACK_DURATION,
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
    state.scheduleMode = true;
    state.fallbackMode = false;
    state.totalPlays++;
    state.lastQueueLoad = new Date();

    // Log RadioPlay only for content items (not vinhetas)
    if (!isVinhetaItem && content) {
      RadioPlay.create({
        channel_id: channelId,
        content_id: content.id,
        titulo: content.titulo,
        tipo: content.tipo,
        played_at: playingSince,
      }).catch(() => {});
    }

    const ts = new Date().toISOString();

    if (!wasPlaying) {
      realtimeService.broadcastPublic("radio_online", {
        channelId,
        ts,
        currentTrack: { id: track.contentId, titulo: track.titulo },
      });
    }

    realtimeService.broadcastPublic("current_track_changed", {
      channelId,
      current: {
        id: track.contentId,
        titulo: track.titulo,
        audioUrl: track.audioUrl,
        artworkUrl: track.artworkUrl,
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
      titulo: track.titulo,
      tipo: track.tipo,
      hora: currentItem.hora_execucao,
      endsAt,
    });
  }

  /* ── Init ───────────────────────────────────────────────────────────── */

  async initChannel(channelId: number): Promise<void> {
    const state = this.getOrCreateState(channelId);
    state.scheduleMode = true;
    state.fallbackMode = false;
    state.lastQueueLoad = new Date();
    // Run first tick immediately to set accurate state
    await this.tickScheduleMode(channelId, state);
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
      const state = this.getOrCreateState(ch.id);
      await this.tickScheduleMode(ch.id, state).catch((err) =>
        logger.debug("AutoDJService: tick failed", { channelId: ch.id, err: (err as Error).message }),
      );
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
        scheduleMode: true,
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
      scheduleMode: true,
      startedAt: state.playingSince?.toISOString() ?? null,
      endsAt,
      progressSec,
      remainingSec,
      listenerCount: state.listenerCount,
      offlineReason: null,
      nextStartsAt: state.nextStartsAt,
    };
  }

  getQueue(channelId: number, limit = 10): TrackInfo[] {
    const state = this.states.get(channelId);
    if (!state) return [];
    return state.queue.slice(state.currentIndex, state.currentIndex + limit);
  }

  getAllChannelStates(): ChannelDJState[] {
    return Array.from(this.states.values());
  }

  getChannelState(channelId: number): ChannelDJState | undefined {
    return this.states.get(channelId);
  }

  addListener(channelId: number): void {
    const state = this.getOrCreateState(channelId);
    state.listenerCount++;
    if (state.listenerCount > state.peakListeners) {
      state.peakListeners = state.listenerCount;
    }
  }

  removeListener(channelId: number): void {
    const state = this.states.get(channelId);
    if (state && state.listenerCount > 0) state.listenerCount--;
  }

  async restart(channelId: number): Promise<void> {
    const state = this.states.get(channelId);
    if (state) {
      state.isPlaying = false;
      state.queue = [];
      state.currentIndex = 0;
      state.pendingNext = null;
      state.blockEndsAt = null;
    }
    await this.initChannel(channelId);
  }

  async reload(channelId: number): Promise<void> {
    await this.initChannel(channelId);
  }
}

export const autoDjService = new AutoDJService();

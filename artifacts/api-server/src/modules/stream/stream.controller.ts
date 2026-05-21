import type { Request, Response } from "express";
import { ok, notFound } from "../../utils/response.js";
import { autoDjService } from "../../services/AutoDJService.js";
import { streamSessionStore } from "../../services/StreamSessionStore.js";
import { Channel } from "../../models/index.js";

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function getChannelId(req: Request): number {
  const raw = req.params["channelId"] ?? req.query["channel"];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function getBaseUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol ?? "http";
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "localhost";
  return `${proto}://${host}`;
}

function buildAbsoluteAudioUrl(audioUrl: string, baseUrl: string): string {
  if (audioUrl.startsWith("http://") || audioUrl.startsWith("https://")) return audioUrl;
  return `${baseUrl}${audioUrl.startsWith("/") ? "" : "/"}${audioUrl}`;
}

function corsHeaders(res: Response): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "X-AutoDJ-Session, X-Channel-Id");
}

/* ─── Public: HLS live.m3u8 ─────────────────────────────────────────────── */
// Accepts both:
//   GET /public/stream/:channelId/live.m3u8   (path param)
//   GET /public/live.m3u8?channel=<id>        (query param)

export async function getLiveM3u8(req: Request, res: Response): Promise<void> {
  const channelId = getChannelId(req);
  if (Number.isNaN(channelId)) {
    res.status(400).json({ success: false, message: "channel inválido" });
    return;
  }

  const channel = await Channel.findByPk(channelId, { attributes: ["id", "nome", "ativo"] });
  if (!channel || !channel.ativo) {
    res.status(404).json({ success: false, message: "Canal não encontrado ou inativo" });
    return;
  }

  const nowPlaying = autoDjService.getNowPlaying(channelId);
  corsHeaders(res);

  // ── Offline: 204 so hls.js stops polling and treats as offline ────────
  if (!nowPlaying.isPlaying) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("X-Offline-Reason", nowPlaying.offlineReason ?? "no_schedule");
    if (nowPlaying.nextStartsAt) res.setHeader("X-Next-Starts-At", nowPlaying.nextStartsAt);
    res.status(204).end();
    return;
  }

  // ── Online: serve HLS playlist ────────────────────────────────────────
  const baseUrl = getBaseUrl(req);
  const queue = autoDjService.getQueue(channelId, 10);
  const tracks = queue.filter((t) => t.audioUrl);

  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
  const ua = (req.headers["user-agent"] as string | undefined) ?? "";
  const session = streamSessionStore.create(channelId, ip, ua);

  const targetDuration = tracks.length > 0
    ? Math.ceil(Math.max(...tracks.map((t) => t.duracao || 300)))
    : 300;

  const lines: string[] = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:${nowPlaying.progressSec > 0 ? 1 : 0}`,
    "#EXT-X-ALLOW-CACHE:NO",
    `#EXT-X-PROGRAM-DATE-TIME:${nowPlaying.startedAt ?? new Date().toISOString()}`,
    `# X-AUTODJ-SESSION: ${session.token}`,
    `# X-CHANNEL: ${channel.nome}`,
    "",
  ];

  for (const track of tracks) {
    const dur = track.duracao > 0 ? track.duracao : 300;
    lines.push(`#EXTINF:${dur},${track.titulo}`);
    lines.push(buildAbsoluteAudioUrl(track.audioUrl!, baseUrl));
  }

  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("X-AutoDJ-Session", session.token);
  res.setHeader("X-Channel-Id", String(channelId));
  res.status(200).send(lines.join("\n") + "\n");
}

/* ─── Public: now-playing.json ───────────────────────────────────────────── */
// Accepts both:
//   GET /public/stream/:channelId/now-playing.json   (path param)
//   GET /public/now-playing.json?channel=<id>        (query param)

export async function getNowPlaying(req: Request, res: Response): Promise<void> {
  const channelId = getChannelId(req);
  if (Number.isNaN(channelId)) {
    res.status(400).json({ success: false, message: "channel inválido" });
    return;
  }

  const channel = await Channel.findByPk(channelId, { attributes: ["id", "nome", "ativo"] });
  if (!channel) {
    notFound(res, "Canal não encontrado");
    return;
  }

  const np = autoDjService.getNowPlaying(channelId);
  corsHeaders(res);
  res.setHeader("Cache-Control", "no-cache");

  // Shape the response matching the frontend contract
  ok(res, {
    channel: { id: channelId, nome: channel.nome, ativo: channel.ativo },
    isPlaying: np.isPlaying,
    scheduleMode: np.scheduleMode,

    // Current block (null when offline)
    current: np.current
      ? {
          id: np.current.contentId,
          titulo: np.current.titulo,
          tipo: np.current.tipo,
          audioUrl: np.current.audioUrl,
          artworkUrl: np.current.artworkUrl,
          duracao: np.current.duracao,
          startedAt: np.current.startedAt ?? np.startedAt,
          endsAt: np.current.endsAt ?? np.endsAt,
        }
      : null,

    // Next block (available even when offline)
    next: np.next
      ? {
          id: np.next.contentId,
          titulo: np.next.titulo,
          tipo: np.next.tipo,
          audioUrl: np.next.audioUrl,
          artworkUrl: np.next.artworkUrl,
          startedAt: np.next.startedAt,
        }
      : null,

    // Progress (meaningful only when isPlaying = true)
    progressSec: np.progressSec,
    remainingSec: np.remainingSec,
    endsAt: np.endsAt,

    // Offline info (populated when isPlaying = false)
    offlineReason: np.offlineReason,
    nextStartsAt: np.nextStartsAt,

    listeners: np.listenerCount,
    fetchedAt: new Date().toISOString(),
  });
}

/* ─── Public: ping ───────────────────────────────────────────────────────── */

export function ping(req: Request, res: Response): void {
  const token = req.query["token"] as string | undefined;
  if (!token) {
    res.status(400).json({ success: false, message: "token obrigatório" });
    return;
  }
  const alive = streamSessionStore.ping(token);
  res.json({ success: alive, alive, ts: new Date().toISOString() });
}

/* ─── Public: playlist.json ──────────────────────────────────────────────── */

export async function getPublicPlaylist(req: Request, res: Response): Promise<void> {
  const channelId = getChannelId(req);
  if (Number.isNaN(channelId)) {
    res.status(400).json({ success: false, message: "channel inválido" });
    return;
  }
  const queue = autoDjService.getQueue(channelId, 20);
  corsHeaders(res);
  res.setHeader("Cache-Control", "no-cache");
  ok(res, { channelId, queue, count: queue.length, fetchedAt: new Date().toISOString() });
}

/* ─── Admin: status ─────────────────────────────────────────────────────── */

export async function getAdminStatus(_req: Request, res: Response): Promise<void> {
  const channels = await Channel.findAll({ where: { ativo: true }, attributes: ["id", "nome"] });
  const states = autoDjService.getAllChannelStates();
  const stateMap = new Map(states.map((s) => [s.channelId, s]));
  const listenerStats = streamSessionStore.getStats();
  const listenerByChannel = new Map(listenerStats.byChannel.map((b) => [b.channelId, b]));

  const channelStatus = channels.map((ch) => {
    const state = stateMap.get(ch.id);
    const listeners = listenerByChannel.get(ch.id);
    const np = autoDjService.getNowPlaying(ch.id);
    return {
      channelId: ch.id,
      nome: ch.nome,
      isPlaying: state?.isPlaying ?? false,
      scheduleMode: state?.scheduleMode ?? false,
      fallbackMode: state?.fallbackMode ?? false,
      queueSize: state?.queue.length ?? 0,
      totalPlays: state?.totalPlays ?? 0,
      lastQueueLoad: state?.lastQueueLoad?.toISOString() ?? null,
      offlineReason: state?.offlineReason ?? null,
      nextStartsAt: state?.nextStartsAt ?? null,
      listenerCount: listeners?.listeners ?? 0,
      peakListeners: listeners?.peak ?? 0,
      currentTrack: np.current
        ? { titulo: np.current.titulo, tipo: np.current.tipo, startedAt: np.current.startedAt, endsAt: np.current.endsAt, progressSec: np.progressSec, remainingSec: np.remainingSec }
        : null,
    };
  });

  ok(res, {
    watcherActive: true,
    totalChannels: channels.length,
    playingChannels: channelStatus.filter((c) => c.isPlaying).length,
    totalListeners: listenerStats.totalActive,
    channels: channelStatus,
    checkedAt: new Date().toISOString(),
  });
}

/* ─── Admin: listeners ───────────────────────────────────────────────────── */

export function getListeners(_req: Request, res: Response): void {
  const stats = streamSessionStore.getStats();
  ok(res, {
    ...stats,
    sessions: stats.sessions.map((s) => ({
      ...s,
      ip: s.ip.replace(/(\d+\.\d+)\.\d+\.\d+/, "$1.x.x"),
    })),
  });
}

/* ─── Admin: restart ─────────────────────────────────────────────────────── */

export async function restartChannel(req: Request, res: Response): Promise<void> {
  const channelId = Number(req.params["channelId"]);
  if (Number.isNaN(channelId) || channelId <= 0) {
    res.status(400).json({ success: false, message: "channelId inválido" });
    return;
  }
  await autoDjService.restart(channelId);
  const np = autoDjService.getNowPlaying(channelId);
  ok(res, {
    message: `Canal ${channelId} reiniciado`,
    channelId,
    isPlaying: np.isPlaying,
    scheduleMode: autoDjService.getChannelState(channelId)?.scheduleMode ?? false,
    currentTrack: np.current?.titulo ?? null,
    queueSize: autoDjService.getQueue(channelId, 100).length,
  });
}

/* ─── Admin: reload ──────────────────────────────────────────────────────── */

export async function reloadChannel(req: Request, res: Response): Promise<void> {
  const channelId = Number(req.params["channelId"]);
  if (Number.isNaN(channelId) || channelId <= 0) {
    res.status(400).json({ success: false, message: "channelId inválido" });
    return;
  }
  await autoDjService.reload(channelId);
  const queue = autoDjService.getQueue(channelId, 10);
  ok(res, {
    message: `Playlist do canal ${channelId} recarregada`,
    channelId,
    scheduleMode: autoDjService.getChannelState(channelId)?.scheduleMode ?? false,
    queueSize: queue.length,
    nextTracks: queue.slice(0, 3).map((t) => t.titulo),
  });
}

/* ─── Admin: channels ────────────────────────────────────────────────────── */

export async function getStreamChannels(_req: Request, res: Response): Promise<void> {
  const channels = await Channel.findAll({ where: { ativo: true }, attributes: ["id", "nome"] });
  ok(res, {
    channels: channels.map((ch) => {
      const np = autoDjService.getNowPlaying(ch.id);
      const state = autoDjService.getChannelState(ch.id);
      return {
        id: ch.id,
        nome: ch.nome,
        m3u8Path: `/api/public/stream/${ch.id}/live.m3u8`,
        m3u8QueryPath: `/api/public/live.m3u8?channel=${ch.id}`,
        nowPlayingPath: `/api/public/now-playing.json?channel=${ch.id}`,
        isPlaying: np.isPlaying,
        scheduleMode: state?.scheduleMode ?? false,
        offlineReason: np.offlineReason,
        nextStartsAt: np.nextStartsAt,
        currentTrack: np.current?.titulo ?? null,
        listeners: np.listenerCount,
      };
    }),
  });
}

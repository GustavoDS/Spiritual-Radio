import type { Request, Response } from "express";
import { ok, notFound } from "../../utils/response.js";
import { autoDjService } from "../../services/AutoDJService.js";
import { streamSessionStore } from "../../services/StreamSessionStore.js";
import { Channel } from "../../models/index.js";

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function getBaseUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol ?? "http";
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host ?? "localhost";
  return `${proto}://${host}`;
}

function buildAbsoluteAudioUrl(audioUrl: string, baseUrl: string): string {
  if (audioUrl.startsWith("http://") || audioUrl.startsWith("https://")) return audioUrl;
  return `${baseUrl}${audioUrl.startsWith("/") ? "" : "/"}${audioUrl}`;
}

/* ─── Public: GET /public/stream/:channelId/live.m3u8 ───────────────────── */

export async function getLiveM3u8(req: Request, res: Response): Promise<void> {
  const channelId = Number(req.params["channelId"]);
  if (Number.isNaN(channelId) || channelId <= 0) {
    res.status(400).json({ success: false, message: "channelId inválido" });
    return;
  }

  const channel = await Channel.findByPk(channelId, { attributes: ["id", "nome", "ativo"] });
  if (!channel || !channel.ativo) {
    res.status(404).json({ success: false, message: "Canal não encontrado ou inativo" });
    return;
  }

  const baseUrl = getBaseUrl(req);
  const queue = autoDjService.getQueue(channelId, 10);
  const now = autoDjService.getNowPlaying(channelId);

  // Register a listener session (non-blocking)
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
  const ua = (req.headers["user-agent"] as string | undefined) ?? "";
  const session = streamSessionStore.create(channelId, ip, ua);

  // Build HLS playlist
  const tracks = queue.filter((t) => t.audioUrl);

  const targetDuration = tracks.length > 0
    ? Math.ceil(Math.max(...tracks.map((t) => t.duracao || 300)))
    : 300;

  const lines: string[] = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:${now.progressSec > 0 ? 1 : 0}`,
    "#EXT-X-ALLOW-CACHE:NO",
    `#EXT-X-PROGRAM-DATE-TIME:${now.startedAt ?? new Date().toISOString()}`,
    `# X-AUTODJ-SESSION: ${session.token}`,
    `# X-CHANNEL: ${channel.nome}`,
    "",
  ];

  if (tracks.length === 0) {
    // No audio content — return empty event playlist
    lines.push("# No audio content available at this time.");
    lines.push("# Please check back later or contact the station.");
  } else {
    for (const track of tracks) {
      const dur = track.duracao > 0 ? track.duracao : 300;
      lines.push(`#EXTINF:${dur},${track.titulo}`);
      lines.push(buildAbsoluteAudioUrl(track.audioUrl!, baseUrl));
    }
  }

  // Set caching headers
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-AutoDJ-Session", session.token);
  res.setHeader("X-Channel-Id", String(channelId));
  res.status(200).send(lines.join("\n") + "\n");
}

/* ─── Public: GET /public/stream/:channelId/now-playing.json ────────────── */

export async function getNowPlaying(req: Request, res: Response): Promise<void> {
  const channelId = Number(req.params["channelId"]);
  if (Number.isNaN(channelId) || channelId <= 0) {
    res.status(400).json({ success: false, message: "channelId inválido" });
    return;
  }

  const channel = await Channel.findByPk(channelId, { attributes: ["id", "nome", "ativo"] });
  if (!channel) {
    notFound(res, "Canal não encontrado");
    return;
  }

  const nowPlaying = autoDjService.getNowPlaying(channelId);

  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", "*");
  ok(res, {
    channel: { id: channelId, nome: channel.nome, ativo: channel.ativo },
    ...nowPlaying,
    fetchedAt: new Date().toISOString(),
  });
}

/* ─── Public: POST /public/stream/ping ──────────────────────────────────── */

export function ping(req: Request, res: Response): void {
  const token = req.query["token"] as string | undefined;
  if (!token) {
    res.status(400).json({ success: false, message: "token obrigatório" });
    return;
  }

  const ok2 = streamSessionStore.ping(token);
  res.json({ success: ok2, alive: ok2, ts: new Date().toISOString() });
}

/* ─── Public: GET /public/stream/:channelId/playlist.json ───────────────── */

export async function getPublicPlaylist(req: Request, res: Response): Promise<void> {
  const channelId = Number(req.params["channelId"]);
  if (Number.isNaN(channelId) || channelId <= 0) {
    res.status(400).json({ success: false, message: "channelId inválido" });
    return;
  }

  const queue = autoDjService.getQueue(channelId, 20);
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", "*");
  ok(res, { channelId, queue, count: queue.length, fetchedAt: new Date().toISOString() });
}

/* ─── Admin: GET /api/admin/stream/status ───────────────────────────────── */

export async function getAdminStatus(_req: Request, res: Response): Promise<void> {
  const channels = await Channel.findAll({ where: { ativo: true }, attributes: ["id", "nome"] });
  const states = autoDjService.getAllChannelStates();
  const stateMap = new Map(states.map((s) => [s.channelId, s]));
  const listenerStats = streamSessionStore.getStats();
  const listenerByChannel = new Map(listenerStats.byChannel.map((b) => [b.channelId, b]));

  const channelStatus = channels.map((ch) => {
    const state = stateMap.get(ch.id);
    const listeners = listenerByChannel.get(ch.id);
    const nowPlaying = autoDjService.getNowPlaying(ch.id);

    return {
      channelId: ch.id,
      nome: ch.nome,
      isPlaying: state?.isPlaying ?? false,
      fallbackMode: state?.fallbackMode ?? false,
      queueSize: state?.queue.length ?? 0,
      currentIndex: state?.currentIndex ?? 0,
      totalPlays: state?.totalPlays ?? 0,
      lastQueueLoad: state?.lastQueueLoad?.toISOString() ?? null,
      listenerCount: listeners?.listeners ?? 0,
      peakListeners: listeners?.peak ?? 0,
      currentTrack: nowPlaying.current
        ? { titulo: nowPlaying.current.titulo, tipo: nowPlaying.current.tipo, progressSec: nowPlaying.progressSec, remainingSec: nowPlaying.remainingSec }
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

/* ─── Admin: GET /api/admin/stream/listeners ────────────────────────────── */

export function getListeners(_req: Request, res: Response): void {
  const stats = streamSessionStore.getStats();
  ok(res, {
    ...stats,
    // Redact IPs partially for privacy
    sessions: stats.sessions.map((s) => ({
      ...s,
      ip: s.ip.replace(/(\d+\.\d+)\.\d+\.\d+/, "$1.x.x"),
    })),
  });
}

/* ─── Admin: POST /api/admin/stream/restart/:channelId ──────────────────── */

export async function restartChannel(req: Request, res: Response): Promise<void> {
  const channelId = Number(req.params["channelId"]);
  if (Number.isNaN(channelId) || channelId <= 0) {
    res.status(400).json({ success: false, message: "channelId inválido" });
    return;
  }

  await autoDjService.restart(channelId);
  const nowPlaying = autoDjService.getNowPlaying(channelId);

  ok(res, {
    message: `Canal ${channelId} reiniciado`,
    channelId,
    isPlaying: nowPlaying.isPlaying,
    currentTrack: nowPlaying.current?.titulo ?? null,
    queueSize: autoDjService.getQueue(channelId, 100).length,
  });
}

/* ─── Admin: POST /api/admin/stream/reload/:channelId ───────────────────── */

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
    queueSize: queue.length,
    nextTracks: queue.slice(0, 3).map((t) => t.titulo),
  });
}

/* ─── Admin: GET /api/admin/stream/channels ─────────────────────────────── */

export async function getStreamChannels(_req: Request, res: Response): Promise<void> {
  const channels = await Channel.findAll({ where: { ativo: true }, attributes: ["id", "nome"] });

  ok(res, {
    channels: channels.map((ch) => {
      const now = autoDjService.getNowPlaying(ch.id);
      return {
        id: ch.id,
        nome: ch.nome,
        m3u8Path: `/api/public/stream/${ch.id}/live.m3u8`,
        nowPlayingPath: `/api/public/stream/${ch.id}/now-playing.json`,
        isPlaying: now.isPlaying,
        currentTrack: now.current?.titulo ?? null,
        listeners: now.listenerCount,
      };
    }),
  });
}

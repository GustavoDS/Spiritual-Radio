import crypto from "crypto";
import type { Response } from "express";
import { logger } from "../lib/logger.js";
import { RadioPlay } from "../models/index.js";

/* ─── Event Types ─────────────────────────────────────────────────────────── */

export type PublicEvent =
  | "current_track_changed"
  | "next_track_changed"
  | "radio_online"
  | "radio_offline"
  | "playlist_updated";

export type AdminEvent =
  | "message_received"
  | "prayer_urgent"
  | "tts_completed"
  | "tts_failed"
  | "ai_generation_completed"
  | "ai_generation_failed"
  | "playlist_regenerated"
  | "schedule_executed"
  | "radio_status_changed"
  | "queue_failed"
  | "queue_recovered"
  | "system_warning"
  | "automation_started"
  | "automation_completed"
  | "automation_failed"
  | "auto_content_generated"
  | "auto_playlist_updated";

export type RealtimeEventType = PublicEvent | AdminEvent;

/* ─── Client ──────────────────────────────────────────────────────────────── */

interface SSEClient {
  id: string;
  res: Response;
  isAdmin: boolean;
  userId?: number;
  ip: string;
  connectedAt: Date;
  lastActivity: Date;
}

/* ─── Track watcher payload ───────────────────────────────────────────────── */

export interface TrackPayload {
  id: number | null;
  titulo?: string;
  tipo?: string;
  audioUrl?: string;
  artworkUrl?: string;
}

type GetChannelsFn = () => Promise<number[]>;
type GetCurrentFn = (channelId: number) => Promise<TrackPayload | null>;
type GetNextFn = (channelId: number) => Promise<TrackPayload | null>;

/* ─── Constants ───────────────────────────────────────────────────────────── */

const MAX_TOTAL = 200;
const MAX_PER_IP = 10;
const HEARTBEAT_MS = 30_000;
const TIMEOUT_MS = 90_000;

/* ─── Service ─────────────────────────────────────────────────────────────── */

class RealtimeService {
  private readonly clients = new Map<string, SSEClient>();
  private readonly ipCounts = new Map<string, number>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private trackWatcherTimer: ReturnType<typeof setInterval> | null = null;
  private readonly lastTrackIds = new Map<number, number | null>();

  constructor() {
    this.heartbeatTimer = setInterval(() => this.runHeartbeat(), HEARTBEAT_MS);
    (this.heartbeatTimer as NodeJS.Timeout).unref?.();
  }

  /* ─── Heartbeat ───────────────────────────────────────────────────────── */

  private runHeartbeat(): void {
    const now = Date.now();
    for (const [id, client] of this.clients) {
      if (now - client.lastActivity.getTime() > TIMEOUT_MS) {
        logger.debug("SSE: removing timed-out client", { clientId: id });
        this.removeClient(id);
        continue;
      }
      try {
        client.res.write(": ping\n\n");
        client.lastActivity = new Date();
      } catch {
        this.removeClient(id);
      }
    }
  }

  /* ─── Track Watcher ───────────────────────────────────────────────────── */

  startTrackWatcher(
    getChannels: GetChannelsFn,
    getCurrent: GetCurrentFn,
    getNext: GetNextFn,
    intervalMs = 60_000,
  ): void {
    if (this.trackWatcherTimer) return;

    this.trackWatcherTimer = setInterval(async () => {
      if (this.clients.size === 0) return;
      try {
        const channelIds = await getChannels();
        for (const channelId of channelIds) {
          const current = await getCurrent(channelId);
          const currentId = current?.id ?? null;
          const lastId = this.lastTrackIds.get(channelId);

          if (lastId !== undefined && lastId !== currentId) {
            const next = await getNext(channelId);
            this.broadcastPublic("current_track_changed", {
              channelId,
              current: current
                ? { id: current.id, titulo: current.titulo, audioUrl: current.audioUrl, artworkUrl: current.artworkUrl }
                : null,
              next: next ? { id: next.id, titulo: next.titulo } : null,
              ts: new Date().toISOString(),
            });
            if (next) {
              this.broadcastPublic("next_track_changed", {
                channelId,
                next: { id: next.id, titulo: next.titulo },
                ts: new Date().toISOString(),
              });
            }
            if (currentId !== null) {
              this.broadcastPublic("radio_online", { channelId, ts: new Date().toISOString() });
              // Record play event for analytics (non-blocking)
              RadioPlay.create({
                channel_id: channelId,
                content_id: currentId,
                titulo: current?.titulo ?? "(desconhecido)",
                tipo: current?.tipo ?? "desconhecido",
                played_at: new Date(),
              }).catch((err) => {
                logger.debug("RadioPlay.create failed (non-fatal)", { err: (err as Error).message });
              });
            } else {
              this.broadcastPublic("radio_offline", { channelId, ts: new Date().toISOString() });
            }
          }
          this.lastTrackIds.set(channelId, currentId);
        }
      } catch (err) {
        logger.debug("SSE track watcher error", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }, intervalMs);

    (this.trackWatcherTimer as NodeJS.Timeout).unref?.();
    logger.info("SSE track watcher started", { intervalMs });
  }

  /* ─── Connection management ───────────────────────────────────────────── */

  canConnect(ip: string): boolean {
    return this.clients.size < MAX_TOTAL && (this.ipCounts.get(ip) ?? 0) < MAX_PER_IP;
  }

  addClient(res: Response, ip: string, isAdmin: boolean, userId?: number): string {
    const id = crypto.randomUUID();
    this.clients.set(id, {
      id,
      res,
      isAdmin,
      userId,
      ip,
      connectedAt: new Date(),
      lastActivity: new Date(),
    });
    this.ipCounts.set(ip, (this.ipCounts.get(ip) ?? 0) + 1);
    logger.info("SSE client connected", { clientId: id, ip, isAdmin, total: this.clients.size });
    return id;
  }

  removeClient(id: string): void {
    const client = this.clients.get(id);
    if (!client) return;
    this.clients.delete(id);
    const cnt = (this.ipCounts.get(client.ip) ?? 1) - 1;
    if (cnt <= 0) this.ipCounts.delete(client.ip);
    else this.ipCounts.set(client.ip, cnt);
    try {
      client.res.end();
    } catch {
      /* already closed */
    }
    logger.info("SSE client disconnected", { clientId: id, total: this.clients.size });
  }

  /* ─── Broadcast ───────────────────────────────────────────────────────── */

  broadcast(event: RealtimeEventType, data: Record<string, unknown>, adminOnly = false): void {
    if (this.clients.size === 0) return;
    const eventId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const payload = `id: ${eventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    let sent = 0;
    for (const [clientId, client] of this.clients) {
      if (adminOnly && !client.isAdmin) continue;
      try {
        client.res.write(payload);
        client.lastActivity = new Date();
        sent++;
      } catch {
        this.removeClient(clientId);
      }
    }
    if (sent > 0) logger.debug("SSE broadcast", { event, adminOnly, sent });
  }

  broadcastPublic(event: PublicEvent, data: Record<string, unknown>): void {
    this.broadcast(event, data, false);
  }

  broadcastAdmin(event: AdminEvent, data: Record<string, unknown>): void {
    this.broadcast(event, data, true);
  }

  /* ─── Stats ───────────────────────────────────────────────────────────── */

  getStats(): { total: number; admin: number; public: number } {
    let admin = 0;
    for (const c of this.clients.values()) if (c.isAdmin) admin++;
    return { total: this.clients.size, admin, public: this.clients.size - admin };
  }
}

export const realtimeService = new RealtimeService();

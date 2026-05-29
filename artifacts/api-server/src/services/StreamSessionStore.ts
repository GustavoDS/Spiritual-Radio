import crypto from "crypto";
import { logger } from "../lib/logger.js";
import { autoDjService } from "./AutoDJService.js";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface StreamSession {
  token: string;
  channelId: number;
  connectedAt: Date;
  lastPingAt: Date;
  ip: string;
  userAgent: string;
  totalListenedMs: number;
}

export interface ListenerStats {
  totalActive: number;
  byChannel: Array<{ channelId: number; listeners: number; peak: number }>;
  sessions: StreamSession[];
}

/* ─── StreamSessionStore ─────────────────────────────────────────────────── */

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 min without ping = disconnected
const CLEANUP_INTERVAL_MS = 60 * 1000;    // run cleanup every minute

export class StreamSessionStore {
  private sessions = new Map<string, StreamSession>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  /* ── Lifecycle ──────────────────────────────────────────────────────── */

  startCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    if ((this.cleanupTimer as NodeJS.Timeout).unref) {
      (this.cleanupTimer as NodeJS.Timeout).unref();
    }
    logger.debug("StreamSessionStore: cleanup timer started");
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private cleanup(): void {
    const cutoff = Date.now() - SESSION_TIMEOUT_MS;
    let removed = 0;
    for (const [token, session] of this.sessions) {
      if (session.lastPingAt.getTime() < cutoff) {
        this.sessions.delete(token);
        autoDjService.removeListener(session.channelId);
        removed++;
      }
    }
    if (removed > 0) {
      logger.debug("StreamSessionStore: cleaned expired sessions", { removed });
    }
  }

  /* ── Session management ─────────────────────────────────────────────── */

  /**
   * Returns an existing live session for the same (channelId, ip, userAgent)
   * fingerprint, or null if none found / all expired.
   * This prevents HLS manifest polling (every few seconds) from inflating the
   * listener count and the sessions table.
   */
  private findByFingerprint(channelId: number, ip: string, userAgent: string): StreamSession | null {
    const cutoff = Date.now() - SESSION_TIMEOUT_MS;
    for (const session of this.sessions.values()) {
      if (
        session.channelId === channelId &&
        session.ip === ip &&
        session.userAgent === userAgent &&
        session.lastPingAt.getTime() >= cutoff
      ) {
        return session;
      }
    }
    return null;
  }

  /**
   * Returns an existing live session for the same client fingerprint if one
   * exists (and refreshes its lastPingAt), or creates a new session otherwise.
   * Prevents the listener counter from inflating when a single browser polls
   * /live.m3u8 every few seconds.
   */
  create(channelId: number, ip: string, userAgent: string): StreamSession {
    const existing = this.findByFingerprint(channelId, ip, userAgent);
    if (existing) {
      existing.lastPingAt = new Date();
      logger.debug("StreamSessionStore: session reused", { token: existing.token.slice(0, 8), channelId, ip });
      return existing;
    }

    const token = crypto.randomUUID();
    const now = new Date();
    const session: StreamSession = {
      token,
      channelId,
      connectedAt: now,
      lastPingAt: now,
      ip,
      userAgent,
      totalListenedMs: 0,
    };
    this.sessions.set(token, session);
    autoDjService.addListener(channelId);
    logger.debug("StreamSessionStore: session created", { token: token.slice(0, 8), channelId, ip });
    return session;
  }

  ping(token: string): boolean {
    const session = this.sessions.get(token);
    if (!session) return false;
    const now = new Date();
    session.totalListenedMs += now.getTime() - session.lastPingAt.getTime();
    session.lastPingAt = now;
    return true;
  }

  remove(token: string): void {
    const session = this.sessions.get(token);
    if (session) {
      this.sessions.delete(token);
      autoDjService.removeListener(session.channelId);
    }
  }

  get(token: string): StreamSession | null {
    return this.sessions.get(token) ?? null;
  }

  /* ── Analytics ──────────────────────────────────────────────────────── */

  getStats(): ListenerStats {
    const byChannel = new Map<number, number>();
    for (const session of this.sessions.values()) {
      byChannel.set(session.channelId, (byChannel.get(session.channelId) ?? 0) + 1);
    }

    const channelStates = autoDjService.getAllChannelStates();
    const byChannelArr = channelStates.map((s) => ({
      channelId: s.channelId,
      listeners: byChannel.get(s.channelId) ?? 0,
      peak: s.peakListeners,
    }));

    return {
      totalActive: this.sessions.size,
      byChannel: byChannelArr,
      sessions: Array.from(this.sessions.values()),
    };
  }

  count(channelId?: number): number {
    if (channelId === undefined) return this.sessions.size;
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.channelId === channelId) count++;
    }
    return count;
  }
}

export const streamSessionStore = new StreamSessionStore();

import { Op } from "sequelize";
import { Content, Schedule, Channel, ContentChannel } from "../models/index.js";
import { scheduleService } from "./ScheduleService.js";
import { playlistService } from "./PlaylistService.js";
import { logger } from "../lib/logger.js";
import { redis } from "../config/redis.js";
import { env } from "../config/env.js";
import { realtimeService } from "./RealtimeService.js";

const CURRENT_CONTENT_KEY = "radio:current";
const NEXT_CONTENT_KEY = "radio:next";
const CACHE_TTL = 60;

export interface RadioStatus {
  current: Content | null;
  schedule: Schedule | null;
  channel: Channel | null;
  startedAt?: string;
  source?: "playlist" | "schedule";
}

export class RadioService {
  async getCurrentContent(channelId?: number): Promise<RadioStatus> {
    const effectiveChannelId = channelId ?? env.defaultChannelId;
    const cacheKey = `${CURRENT_CONTENT_KEY}:${effectiveChannelId}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as RadioStatus;
    } catch {
      logger.warn("Redis cache miss for current content");
    }

    let result: RadioStatus;

    try {
      const track = await playlistService.getCurrentTrack(effectiveChannelId);
      if (track) {
        const content = (track as unknown as { content: Content | null }).content;
        const channel = await Channel.findByPk(effectiveChannelId);
        result = { current: content, schedule: null, channel, startedAt: track.hora_execucao ?? undefined, source: "playlist" };

        try { await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)); } catch { /* ignore */ }
        return result;
      }
    } catch (err) {
      logger.warn("PlaylistService.getCurrentTrack failed, falling back to schedule", { err });
    }

    const schedules = await scheduleService.getCurrentSchedule(effectiveChannelId);
    const schedule = schedules[0] ?? null;

    let current: Content | null = null;
    if (schedule) {
      // Use the N:N junction — content that belongs to this channel
      current = await Content.findOne({
        where: { ativo: true },
        include: [{
          model: Channel,
          as: "channels",
          where: { id: schedule.channel_id },
          required: true,
          through: { attributes: [] },
          attributes: [],
        }],
        order: [["createdAt", "DESC"]],
      });
    }

    const channel = schedule ? await Channel.findByPk(schedule.channel_id) : null;

    result = {
      current,
      schedule,
      channel,
      startedAt: schedule?.horario_inicio ?? null,
      source: "schedule",
    };

    try { await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)); } catch { /* ignore */ }
    return result;
  }

  async getNextContent(channelId?: number): Promise<Content | null> {
    const effectiveChannelId = channelId ?? env.defaultChannelId;
    const cacheKey = `${NEXT_CONTENT_KEY}:${effectiveChannelId}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as Content;
    } catch { /* cache miss */ }

    try {
      const track = await playlistService.getNextTrack(effectiveChannelId);
      if (track) {
        const content = (track as unknown as { content: Content | null }).content;
        if (content) {
          try { await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(content)); } catch { /* ignore */ }
          return content;
        }
      }
    } catch (err) {
      logger.warn("PlaylistService.getNextTrack failed, falling back to schedule", { err });
    }

    const now = new Date();
    const nextSchedule = await scheduleService.getNextSlot(effectiveChannelId);
    if (!nextSchedule) return null;

    const content = await Content.findOne({
      where: { ativo: true, createdAt: { [Op.lte]: now } },
      include: [{
        model: Channel,
        as: "channels",
        where: { id: nextSchedule.channel_id },
        required: true,
        through: { attributes: [] },
        attributes: [],
      }],
      order: [["createdAt", "DESC"]],
    });

    if (content) {
      try { await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(content)); } catch { /* ignore */ }
    }

    return content;
  }

  async getDaySchedule(channelId?: number): Promise<Schedule[]> {
    return scheduleService.getTodaySchedule(channelId ?? env.defaultChannelId);
  }

  async invalidateCache(channelId?: number): Promise<void> {
    const id = channelId ?? env.defaultChannelId;
    const keys = [`${CURRENT_CONTENT_KEY}:${id}`, `${NEXT_CONTENT_KEY}:${id}`];
    await redis.del(...keys);
    logger.info("Radio cache invalidated", { channelId: id });
    realtimeService.broadcastAdmin("radio_status_changed", {
      channelId: id,
      reason: "cache_invalidated",
      ts: new Date().toISOString(),
    });
  }
}

export const radioService = new RadioService();

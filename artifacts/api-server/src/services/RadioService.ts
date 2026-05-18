import { Op } from "sequelize";
import { Content, Schedule, Channel } from "../models/index.js";
import { scheduleService } from "./ScheduleService.js";
import { logger } from "../lib/logger.js";
import { redis } from "../config/redis.js";

const CURRENT_CONTENT_KEY = "radio:current";
const NEXT_CONTENT_KEY = "radio:next";
const CACHE_TTL = 60;

export interface RadioStatus {
  current: Content | null;
  schedule: Schedule | null;
  channel: Channel | null;
  startedAt?: string;
}

export class RadioService {
  async getCurrentContent(channelId?: number): Promise<RadioStatus> {
    const cacheKey = `${CURRENT_CONTENT_KEY}:${channelId ?? "all"}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as RadioStatus;
    } catch (err) {
      logger.warn("Redis cache miss for current content", { err });
    }

    const schedules = await scheduleService.getCurrentSchedule(channelId);
    const schedule = schedules[0] ?? null;

    let current: Content | null = null;
    if (schedule) {
      current = await Content.findOne({
        where: { channel_id: schedule.channel_id, ativo: true },
        order: [["createdAt", "DESC"]],
      });
    }

    const channel = schedule
      ? await Channel.findByPk(schedule.channel_id)
      : null;

    const result: RadioStatus = {
      current,
      schedule,
      channel,
      startedAt: schedule?.horario_inicio.toISOString(),
    };

    try {
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
    } catch (err) {
      logger.warn("Failed to cache radio status", { err });
    }

    return result;
  }

  async getNextContent(channelId?: number): Promise<Content | null> {
    const cacheKey = `${NEXT_CONTENT_KEY}:${channelId ?? "all"}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as Content;
    } catch {
      // cache miss ok
    }

    const now = new Date();
    const effectiveChannelId = channelId ?? 1;

    const nextSchedule = await scheduleService.getNextSlot(effectiveChannelId);
    if (!nextSchedule) return null;

    const content = await Content.findOne({
      where: {
        channel_id: nextSchedule.channel_id,
        ativo: true,
        createdAt: { [Op.lte]: now },
      },
      order: [["createdAt", "DESC"]],
    });

    if (content) {
      try {
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(content));
      } catch {
        // ignore cache errors
      }
    }

    return content;
  }

  async getDaySchedule(channelId?: number): Promise<Schedule[]> {
    return scheduleService.getTodaySchedule(channelId);
  }

  async invalidateCache(channelId?: number): Promise<void> {
    const keys = [
      `${CURRENT_CONTENT_KEY}:${channelId ?? "all"}`,
      `${NEXT_CONTENT_KEY}:${channelId ?? "all"}`,
    ];
    await redis.del(...keys);
    logger.info("Radio cache invalidated", { channelId });
  }
}

export const radioService = new RadioService();

import type { Request, Response } from "express";
import { Op, fn, col, literal, QueryTypes } from "sequelize";
import { ok } from "../../utils/response.js";
import { sequelize, RadioPlay, AiEvent, ContactMessage, Channel } from "../../models/index.js";
import { redis } from "../../config/redis.js";
import { realtimeService } from "../../services/RealtimeService.js";
import { contentProcessingQueue, voiceSynthesisQueue, scheduleQueue, cleanupQueue } from "../../queues/index.js";
import { env } from "../../config/env.js";

/* ─── Period helper ──────────────────────────────────────────────────────── */

function resolvePeriod(req: Request): { from: Date; to: Date; label: string } {
  const period = (req.query["period"] as string | undefined) ?? "7d";
  const fromQ = req.query["from"] as string | undefined;
  const toQ = req.query["to"] as string | undefined;

  const to = toQ ? new Date(`${toQ}T23:59:59.999Z`) : new Date();

  if (fromQ) {
    return { from: new Date(`${fromQ}T00:00:00.000Z`), to, label: "custom" };
  }

  const now = new Date();
  switch (period) {
    case "today": {
      const from = new Date(now.toISOString().split("T")[0]! + "T00:00:00.000Z");
      return { from, to, label: "today" };
    }
    case "30d": {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return { from, to, label: "30d" };
    }
    default: {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      return { from, to, label: "7d" };
    }
  }
}

async function safeQueueCount(queue: { getJobCounts: () => Promise<Record<string, number>> }): Promise<Record<string, number> | null> {
  try { return await queue.getJobCounts(); } catch { return null; }
}

/* ─── Radio Analytics ───────────────────────────────────────────────────── */

export async function getRadioAnalytics(req: Request, res: Response): Promise<void> {
  const { from, to, label } = resolvePeriod(req);
  const where = { played_at: { [Op.between]: [from, to] } };

  const [totalPlays, byChannel, byHour, topContents, recentPlays, todayPlays] = await Promise.all([
    RadioPlay.count({ where }),

    RadioPlay.findAll({
      where,
      attributes: ["channel_id", [fn("COUNT", col("id")), "plays"]],
      group: ["channel_id"],
      order: [[literal("plays"), "DESC"]],
      raw: true,
    }),

    RadioPlay.findAll({
      where,
      attributes: [
        [fn("EXTRACT", literal("'hour' FROM played_at")), "hour"],
        [fn("COUNT", col("id")), "plays"],
      ],
      group: [fn("EXTRACT", literal("'hour' FROM played_at"))],
      order: [[literal("plays"), "DESC"]],
      raw: true,
    }),

    RadioPlay.findAll({
      where,
      attributes: ["content_id", "titulo", "tipo", [fn("COUNT", col("id")), "plays"]],
      group: ["content_id", "titulo", "tipo"],
      order: [[literal("plays"), "DESC"]],
      limit: 10,
      raw: true,
    }),

    RadioPlay.findAll({
      where,
      order: [["played_at", "DESC"]],
      limit: 10,
      raw: true,
    }),

    RadioPlay.count({
      where: {
        played_at: {
          [Op.gte]: new Date(new Date().toISOString().split("T")[0]! + "T00:00:00.000Z"),
        },
      },
    }),
  ]);

  const activeChannels = await Channel.count({ where: { ativo: true } });

  ok(res, {
    period: { from: from.toISOString(), to: to.toISOString(), label },
    summary: {
      totalPlays,
      todayPlays,
      activeChannels,
    },
    byChannel,
    peakHours: byHour,
    topContents,
    recentPlays,
    generatedAt: new Date().toISOString(),
  });
}

/* ─── AI Analytics ──────────────────────────────────────────────────────── */

export async function getAiAnalytics(req: Request, res: Response): Promise<void> {
  const { from, to, label } = resolvePeriod(req);
  const where = { createdAt: { [Op.between]: [from, to] } };

  const [
    totalEvents,
    byType,
    byProvider,
    successRate,
    recentFailures,
    costAgg,
    durationAgg,
    audioAgg,
    todayEvents,
  ] = await Promise.all([
    AiEvent.count({ where }),

    AiEvent.findAll({
      where,
      attributes: [
        "event_type",
        [fn("COUNT", col("id")), "count"],
        [fn("SUM", col("chars_in")), "totalChars"],
      ],
      group: ["event_type"],
      raw: true,
    }),

    AiEvent.findAll({
      where,
      attributes: [
        "provider",
        "event_type",
        [fn("COUNT", col("id")), "count"],
        [fn("AVG", col("duration_ms")), "avgDurationMs"],
        [fn("SUM", col("cost_usd_est")), "totalCost"],
      ],
      group: ["provider", "event_type"],
      order: [[literal("count"), "DESC"]],
      raw: true,
    }),

    AiEvent.findAll({
      where,
      attributes: [
        "success",
        [fn("COUNT", col("id")), "count"],
      ],
      group: ["success"],
      raw: true,
    }),

    AiEvent.findAll({
      where: { ...where, success: false },
      attributes: ["id", "event_type", "provider", "error", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: 10,
      raw: true,
    }),

    AiEvent.findAll({
      where,
      attributes: [
        [fn("SUM", col("cost_usd_est")), "totalCost"],
        [fn("SUM", col("tokens_est")), "totalTokens"],
      ],
      raw: true,
    }),

    AiEvent.findAll({
      where,
      attributes: [
        [fn("AVG", col("duration_ms")), "avgMs"],
        [fn("MAX", col("duration_ms")), "maxMs"],
        [fn("MIN", col("duration_ms")), "minMs"],
      ],
      raw: true,
    }),

    AiEvent.findAll({
      where: { ...where, event_type: "tts_synthesis" },
      attributes: [
        [fn("SUM", col("audio_duration_sec")), "totalAudioSec"],
        [fn("COUNT", col("id")), "count"],
      ],
      raw: true,
    }),

    AiEvent.count({
      where: {
        createdAt: {
          [Op.gte]: new Date(new Date().toISOString().split("T")[0]! + "T00:00:00.000Z"),
        },
      },
    }),
  ]);

  const cost = (costAgg[0] as unknown as Record<string, number | null>) ?? {};
  const duration = (durationAgg[0] as unknown as Record<string, number | null>) ?? {};
  const audio = (audioAgg[0] as unknown as Record<string, number | null>) ?? {};

  const successCount = (successRate as unknown as Array<{ success: boolean; count: number }>)
    .find((r) => r.success)?.count ?? 0;
  const failureCount = (successRate as unknown as Array<{ success: boolean; count: number }>)
    .find((r) => !r.success)?.count ?? 0;

  ok(res, {
    period: { from: from.toISOString(), to: to.toISOString(), label },
    summary: {
      totalEvents,
      todayEvents,
      successCount,
      failureCount,
      successRate: totalEvents > 0 ? Math.round((Number(successCount) / totalEvents) * 100) : 100,
      totalCostUsd: Number(cost["totalCost"] ?? 0).toFixed(6),
      totalTokensEst: cost["totalTokens"] ?? 0,
      avgDurationMs: duration["avgMs"] ? Math.round(Number(duration["avgMs"])) : 0,
      maxDurationMs: duration["maxMs"] ?? 0,
    },
    tts: {
      totalSyntheses: Number((audioAgg[0] as unknown as Record<string, unknown>)?.["count"] ?? 0),
      totalAudioSec: Number(audio["totalAudioSec"] ?? 0).toFixed(1),
      totalAudioMin: (Number(audio["totalAudioSec"] ?? 0) / 60).toFixed(1),
    },
    byType,
    byProvider,
    recentFailures,
    generatedAt: new Date().toISOString(),
  });
}

/* ─── Message Analytics ─────────────────────────────────────────────────── */

export async function getMessageAnalytics(req: Request, res: Response): Promise<void> {
  const { from, to, label } = resolvePeriod(req);
  const where = { createdAt: { [Op.between]: [from, to] } };

  const [total, byTipo, byStatus, byPrioridade, unread, urgent, dailyTrend, avgResponseTimeRaw] = await Promise.all([
    ContactMessage.count({ where }),

    ContactMessage.findAll({
      where,
      attributes: ["tipo", [fn("COUNT", col("id")), "count"]],
      group: ["tipo"],
      raw: true,
    }),

    ContactMessage.findAll({
      where,
      attributes: ["status", [fn("COUNT", col("id")), "count"]],
      group: ["status"],
      raw: true,
    }),

    ContactMessage.findAll({
      where,
      attributes: ["prioridade", [fn("COUNT", col("id")), "count"]],
      group: ["prioridade"],
      raw: true,
    }),

    ContactMessage.count({ where: { lido_em: null } }),

    ContactMessage.count({
      where: {
        ...where,
        prioridade: { [Op.in]: ["urgente", "alta"] },
        status: { [Op.in]: ["novo", "em_analise"] },
      },
    }),

    ContactMessage.findAll({
      where,
      attributes: [
        [fn("DATE", col("createdAt")), "date"],
        [fn("COUNT", col("id")), "count"],
      ],
      group: [fn("DATE", col("createdAt"))],
      order: [[fn("DATE", col("createdAt")), "ASC"]],
      raw: true,
    }),

    sequelize.query<{ avg_ms: string | null }>(`
      SELECT AVG(EXTRACT(EPOCH FROM (lido_em - "createdAt")) * 1000) AS avg_ms
      FROM contact_messages
      WHERE lido_em IS NOT NULL
        AND "createdAt" >= :from
        AND "createdAt" <= :to
    `, {
      replacements: { from: from.toISOString(), to: to.toISOString() },
      type: QueryTypes.SELECT,
    }),
  ]);

  const avgResponseMs = avgResponseTimeRaw[0]?.["avg_ms"]
    ? Math.round(Number(avgResponseTimeRaw[0]["avg_ms"]))
    : null;

  ok(res, {
    period: { from: from.toISOString(), to: to.toISOString(), label },
    summary: {
      total,
      unread,
      urgentPending: urgent,
      avgResponseMs,
      avgResponseMin: avgResponseMs ? Math.round(avgResponseMs / 60000) : null,
    },
    byTipo,
    byStatus,
    byPrioridade,
    dailyTrend,
    generatedAt: new Date().toISOString(),
  });
}

/* ─── System Analytics ──────────────────────────────────────────────────── */

export async function getSystemAnalytics(_req: Request, res: Response): Promise<void> {
  const todayStart = new Date(new Date().toISOString().split("T")[0]! + "T00:00:00.000Z");

  const [redisResult, dbResult, queues, todayPlays, todayAiEvents] = await Promise.allSettled([
    (async () => {
      const t0 = Date.now();
      await redis.ping();
      return { ok: true, latencyMs: Date.now() - t0 };
    })(),
    (async () => {
      const t0 = Date.now();
      await sequelize.authenticate();
      return { ok: true, latencyMs: Date.now() - t0 };
    })(),
    Promise.all([
      safeQueueCount(contentProcessingQueue),
      safeQueueCount(voiceSynthesisQueue),
      safeQueueCount(scheduleQueue),
      safeQueueCount(cleanupQueue),
    ]),
    RadioPlay.count({ where: { played_at: { [Op.gte]: todayStart } } }),
    AiEvent.count({ where: { createdAt: { [Op.gte]: todayStart } } }),
  ]);

  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const sseStats = realtimeService.getStats();

  const redisOk = redisResult.status === "fulfilled" ? redisResult.value : { ok: false, latencyMs: null };
  const dbOk = dbResult.status === "fulfilled" ? dbResult.value : { ok: false, latencyMs: null };
  const queueCounts = queues.status === "fulfilled" ? queues.value : [null, null, null, null];
  const [qcp, qvs, qsc, qcl] = queueCounts;

  ok(res, {
    checkedAt: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    process: {
      nodeVersion: process.version,
      pid: process.pid,
      memoryMb: {
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        rss: Math.round(mem.rss / 1024 / 1024),
        external: Math.round(mem.external / 1024 / 1024),
      },
      cpuMs: {
        user: Math.round(cpu.user / 1000),
        system: Math.round(cpu.system / 1000),
      },
    },
    services: {
      database: dbOk,
      redis: redisOk,
      bullmq: {
        available: redisOk.ok,
        queues: {
          "content-processing": qcp,
          "voice-synthesis": qvs,
          schedule: qsc,
          cleanup: qcl,
        },
      },
    },
    realtime: sseStats,
    storage: {
      provider: env.storageProvider,
      bucket: env.storageProvider === "r2" ? env.r2Bucket
        : env.storageProvider === "s3" ? env.s3Bucket
        : env.uploadDir,
    },
    today: {
      radioPlays: todayPlays.status === "fulfilled" ? todayPlays.value : null,
      aiEvents: todayAiEvents.status === "fulfilled" ? todayAiEvents.value : null,
    },
    config: {
      nodeEnv: env.nodeEnv,
      aiProvider: env.aiProvider,
      ttsProvider: env.ttsProvider,
    },
  });
}

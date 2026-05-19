import fs from "fs";
import type { Request, Response } from "express";
import { ok, created, badRequest } from "../../utils/response.js";
import { logger } from "../../lib/logger.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { messageService } from "../messages/messages.service.js";
import { playlistService } from "../../services/PlaylistService.js";
import { radioService } from "../../services/RadioService.js";
import { voiceService, runSynthesis } from "../../services/VoiceService.js";
import { contentProcessingQueue, voiceSynthesisQueue, scheduleQueue, cleanupQueue } from "../../queues/index.js";
import { scheduleQueue as scheduleQueueRef } from "../../queues/index.js";
import { redis } from "../../config/redis.js";
import { sequelize, Channel, Playlist, PlaylistItem, Content, Voice, ContactMessage } from "../../models/index.js";
import { env } from "../../config/env.js";
import type { ContactPrioridade } from "../../models/ContactMessage.js";
import type { UpdatePriorityInput, RunNowInput, GenerateTtsInput } from "./admin-ops.validators.js";

async function safeQueueCount(queue: { getJobCounts: () => Promise<Record<string, number>> }): Promise<Record<string, number> | null> {
  try {
    return await queue.getJobCounts();
  } catch {
    return null;
  }
}

/* ─── Messages ─────────────────────────────────────────────────────────── */

export async function getUnreadCount(_req: Request, res: Response): Promise<void> {
  const unread = await ContactMessage.count({ where: { lido_em: null } });
  ok(res, { unread });
}

export async function updatePriority(req: Request, res: Response): Promise<void> {
  const data = req.body as UpdatePriorityInput;
  const id = Number(req.params["id"]);
  const msg = await messageService.updatePriority(id, data.prioridade as ContactPrioridade);
  logger.info("admin: message priority updated", { id, prioridade: data.prioridade, adminId: (req as Request & { user?: { id: number } }).user?.id });
  ok(res, msg, "Prioridade atualizada");
}

/* ─── Playlists ─────────────────────────────────────────────────────────── */

export async function regeneratePlaylist(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  const playlist = await Playlist.findByPk(id);
  if (!playlist) throw new HttpError("Playlist não encontrada", 404);

  await PlaylistItem.destroy({ where: { playlist_id: id } });

  const playlistData = (playlist as unknown as { data: string }).data;
  const items = await playlistService.buildPlaylist(id, playlist.channel_id, playlistData);

  logger.info("admin: playlist regenerated manually", {
    playlistId: id,
    channelId: playlist.channel_id,
    date: playlistData,
    items: items.length,
    adminId: (req as Request & { user?: { id: number } }).user?.id,
  });

  ok(res, { playlistId: id, itemsGerados: items.length, data: playlistData }, "Playlist regenerada com sucesso");
}

/* ─── Schedule ─────────────────────────────────────────────────────────── */

export async function runScheduleNow(req: Request, res: Response): Promise<void> {
  const data = req.body as RunNowInput;
  const today = new Date().toISOString().split("T")[0]!;
  const adminId = (req as Request & { user?: { id: number } }).user?.id;

  let channels: { id: number }[];
  if (data.channel_id) {
    const ch = await Channel.findByPk(data.channel_id, { attributes: ["id"] });
    if (!ch) throw new HttpError("Canal não encontrado", 404);
    channels = [{ id: data.channel_id }];
  } else {
    channels = await Channel.findAll({ where: { ativo: true }, attributes: ["id"] });
  }

  const results: Array<{ channelId: number; queued: boolean; items?: number }> = [];

  for (const ch of channels) {
    try {
      await scheduleQueueRef.add("admin-run-now", { channelId: ch.id, date: today });
      results.push({ channelId: ch.id, queued: true });
      logger.info("admin: schedule run-now queued", { channelId: ch.id, today, adminId });
    } catch {
      const playlist = await playlistService.generatePlaylist(ch.id, today);
      const itemCount = await PlaylistItem.count({ where: { playlist_id: playlist.id } });
      results.push({ channelId: ch.id, queued: false, items: itemCount });
      logger.info("admin: schedule run-now executed inline", { channelId: ch.id, today, adminId });
    }
  }

  created(res, { date: today, channels: results }, `Geração de playlists iniciada para ${results.length} canal(is)`);
}

/* ─── Radio Status ─────────────────────────────────────────────────────── */

export async function getRadioStatus(_req: Request, res: Response): Promise<void> {
  const today = new Date().toISOString().split("T")[0]!;

  const [currentStatus, nextContent, activeChannels, generatedToday, messagesPending, queueCounts] = await Promise.allSettled([
    radioService.getCurrentContent(),
    radioService.getNextContent(),
    Channel.count({ where: { ativo: true } }),
    Playlist.count({ where: { data: today } }),
    ContactMessage.count({ where: { status: ["novo", "em_analise"] } }),
    Promise.all([
      safeQueueCount(contentProcessingQueue),
      safeQueueCount(voiceSynthesisQueue),
      safeQueueCount(scheduleQueue),
      safeQueueCount(cleanupQueue),
    ]),
  ]);

  let redisOk = false;
  let redisLatencyMs: number | null = null;
  try {
    const t0 = Date.now();
    await redis.ping();
    redisLatencyMs = Date.now() - t0;
    redisOk = true;
  } catch { /* unavailable */ }

  let dbOk = false;
  let dbLatencyMs: number | null = null;
  try {
    const t0 = Date.now();
    await sequelize.authenticate();
    dbLatencyMs = Date.now() - t0;
    dbOk = true;
  } catch { /* unavailable */ }

  const mem = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const [qcp, qvs, qsc, qcl] = queueCounts.status === "fulfilled" ? queueCounts.value : [null, null, null, null];

  ok(res, {
    online: dbOk,
    currentTrack: currentStatus.status === "fulfilled" ? currentStatus.value.current : null,
    nextTrack: nextContent.status === "fulfilled" ? nextContent.value : null,
    redis: { ok: redisOk, latencyMs: redisLatencyMs },
    database: { ok: dbOk, latencyMs: dbLatencyMs },
    queues: {
      contentProcessing: qcp,
      voiceSynthesis: qvs,
      schedule: qsc,
      cleanup: qcl,
    },
    aiProvider: env.aiProvider,
    ttsProvider: env.ttsProvider,
    activeChannels: activeChannels.status === "fulfilled" ? activeChannels.value : null,
    uptime: Math.floor(process.uptime()),
    memoryUsage: {
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      rssMb: Math.round(mem.rss / 1024 / 1024),
    },
    cpuUsage: {
      userMs: Math.round(cpuUsage.user / 1000),
      systemMs: Math.round(cpuUsage.system / 1000),
    },
    generatedToday: generatedToday.status === "fulfilled" ? generatedToday.value : null,
    messagesPending: messagesPending.status === "fulfilled" ? messagesPending.value : null,
  });
}

/* ─── System Health ─────────────────────────────────────────────────────── */

export async function getSystemHealth(_req: Request, res: Response): Promise<void> {
  const mem = process.memoryUsage();
  const uploadDir = env.uploadDir;

  const [postgresResult, redisResult, queueResults] = await Promise.allSettled([
    (async () => {
      const t0 = Date.now();
      await sequelize.authenticate();
      return { ok: true, latencyMs: Date.now() - t0 };
    })(),
    (async () => {
      const t0 = Date.now();
      await redis.ping();
      return { ok: true, latencyMs: Date.now() - t0 };
    })(),
    Promise.allSettled([
      safeQueueCount(contentProcessingQueue),
      safeQueueCount(voiceSynthesisQueue),
      safeQueueCount(scheduleQueue),
      safeQueueCount(cleanupQueue),
    ]),
  ]);

  const postgres = postgresResult.status === "fulfilled"
    ? postgresResult.value
    : { ok: false, error: (postgresResult.reason as Error).message };

  const redisHealth = redisResult.status === "fulfilled"
    ? redisResult.value
    : { ok: false, latencyMs: null };

  const bullmqAvailable = redisHealth.ok;

  let storageOk = false;
  let uploadsExists = false;
  try {
    uploadsExists = fs.existsSync(uploadDir);
    if (!uploadsExists) fs.mkdirSync(uploadDir, { recursive: true });
    fs.accessSync(uploadDir, fs.constants.W_OK);
    storageOk = true;
  } catch { /* not writable */ }

  const qcp = queueResults.status === "fulfilled" && queueResults.value[0].status === "fulfilled" ? queueResults.value[0].value : null;
  const qvs = queueResults.status === "fulfilled" && queueResults.value[1].status === "fulfilled" ? queueResults.value[1].value : null;
  const qsc = queueResults.status === "fulfilled" && queueResults.value[2].status === "fulfilled" ? queueResults.value[2].value : null;
  const qcl = queueResults.status === "fulfilled" && queueResults.value[3].status === "fulfilled" ? queueResults.value[3].value : null;

  const allOk = (postgres as { ok: boolean }).ok && storageOk;

  ok(res, {
    status: allOk ? "healthy" : "degraded",
    postgres,
    redis: redisHealth,
    bullmq: {
      available: bullmqAvailable,
      queues: {
        "content-processing": qcp,
        "voice-synthesis": qvs,
        schedule: qsc,
        cleanup: qcl,
      },
    },
    storage: {
      ok: storageOk,
      provider: env.storageProvider,
      uploadDir,
      dirExists: uploadsExists,
    },
    memory: {
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      rssMb: Math.round(mem.rss / 1024 / 1024),
      externalMb: Math.round(mem.external / 1024 / 1024),
    },
    environment: {
      nodeEnv: env.nodeEnv,
      aiProvider: env.aiProvider,
      ttsProvider: env.ttsProvider,
      storageProvider: env.storageProvider,
      nodeVersion: process.version,
    },
    uptime: Math.floor(process.uptime()),
    checkedAt: new Date().toISOString(),
  });
}

/* ─── Contents TTS ──────────────────────────────────────────────────────── */

export async function generateContentTts(req: Request, res: Response): Promise<void> {
  const data = req.body as GenerateTtsInput;
  const contentId = Number(req.params["id"]);
  const adminId = (req as Request & { user?: { id: number } }).user?.id;

  const content = await Content.findByPk(contentId);
  if (!content) throw new HttpError("Conteúdo não encontrado", 404);

  let voice: Voice | null = null;
  if (data.voice_id) {
    voice = await Voice.findByPk(data.voice_id);
    if (!voice) throw new HttpError("Voz não encontrada", 404);
    if (!voice.ativo) throw new HttpError("Voz inativa", 422);
  } else {
    const hora = new Date().getHours();
    voice = await voiceService.getVoiceForTime(hora);
    if (!voice) {
      voice = await Voice.findOne({ where: { ativo: true }, order: [["id", "ASC"]] });
    }
    if (!voice) throw new HttpError("Nenhuma voz disponível configurada no sistema", 422);
  }

  if (!env.ttsApiKey) {
    badRequest(res, "TTS_API_KEY não configurado — defina a variável antes de usar síntese de voz");
    return;
  }

  logger.info("admin: manual TTS generation started", { contentId, voiceId: voice.id, textLength: data.text.length, adminId });

  let url: string;
  try {
    ({ url } = await runSynthesis(data.text, voice));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("admin: TTS provider error", { contentId, voiceId: voice.id, err: msg });
    res.status(502).json({ success: false, message: `Erro no provedor TTS: ${msg}` });
    return;
  }

  await content.update({ audio_url: url });

  try {
    if (content.channel_id) await radioService.invalidateCache(content.channel_id);
  } catch { /* ignore cache invalidation failure */ }

  logger.info("admin: manual TTS generation complete", { contentId, voiceId: voice.id, url, adminId });

  ok(res, {
    contentId,
    voiceId: voice.id,
    voiceNome: voice.nome,
    audioUrl: url,
  }, "Áudio gerado e salvo com sucesso");
}

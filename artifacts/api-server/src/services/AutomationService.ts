import crypto from "crypto";
import { Op } from "sequelize";
import { logger } from "../lib/logger.js";
import {
  AutomationRule,
  AutomationLog,
  Channel,
  Content,
  Playlist,
  PlaylistItem,
  Voice,
  RadioPlay,
} from "../models/index.js";
import type { TimePeriod } from "../models/AutomationRule.js";
import type { AutomationTrigger } from "../models/AutomationLog.js";
import { aiService } from "./AiService.js";
import { realtimeService } from "./RealtimeService.js";
import { env } from "../config/env.js";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface AutomationRunResult {
  runId: string;
  period: TimePeriod;
  triggeredBy: AutomationTrigger;
  channelsProcessed: number;
  contentsGenerated: number;
  contentsFailed: number;
  costUsdEst: number;
  durationMs: number;
  status: "completed" | "failed" | "partial";
  errors: string[];
}

export interface AutomationServiceStatus {
  isRunning: boolean;
  lastRunAt: string | null;
  lastRunStatus: string;
  lastRunId: string | null;
  currentPeriod: TimePeriod;
  timerActive: boolean;
  timerIntervalMs: number;
  circuitBreaker: {
    ai: CircuitState;
    tts: CircuitState;
  };
}

interface CircuitState {
  open: boolean;
  failures: number;
  lastFailureAt: string | null;
  opensAt: string | null;
}

/* ─── Default rules per period ──────────────────────────────────────────── */

const PERIOD_DEFAULTS: Record<TimePeriod, Partial<AutomationRule>> = {
  madrugada: {
    content_types: ["meditacao", "leitura_biblica"],
    topics: ["paz", "descanso", "contemplação espiritual", "salmos"],
    voice_style: "meditative",
    min_duration_sec: 120,
    max_duration_sec: 600,
    generation_limit: 2,
    cooldown_hours: 6,
    tts_enabled: true,
  },
  morning: {
    content_types: ["devocional", "reflexao", "motivacional"],
    topics: ["gratidão", "fé", "esperança", "bênção do dia", "oração matinal"],
    voice_style: "calm",
    min_duration_sec: 60,
    max_duration_sec: 300,
    generation_limit: 3,
    cooldown_hours: 4,
    tts_enabled: true,
  },
  afternoon: {
    content_types: ["mensagem_curta", "ensinamento"],
    topics: ["perseverança", "trabalho e fé", "sabedoria", "versículo do dia"],
    voice_style: "energetic",
    min_duration_sec: 45,
    max_duration_sec: 180,
    generation_limit: 3,
    cooldown_hours: 3,
    tts_enabled: true,
  },
  evening: {
    content_types: ["oracao", "reflexao"],
    topics: ["gratidão", "perdão", "família", "cura espiritual"],
    voice_style: "welcoming",
    min_duration_sec: 90,
    max_duration_sec: 360,
    generation_limit: 2,
    cooldown_hours: 4,
    tts_enabled: true,
  },
  night: {
    content_types: ["oracao", "meditacao"],
    topics: ["paz", "descanso", "proteção noturna", "fé"],
    voice_style: "welcoming",
    min_duration_sec: 120,
    max_duration_sec: 480,
    generation_limit: 2,
    cooldown_hours: 5,
    tts_enabled: true,
  },
  sunday: {
    content_types: ["devocional", "pregacao", "louvor"],
    topics: ["adoração", "domingo", "culto familiar", "graça", "renovação espiritual"],
    voice_style: "calm",
    min_duration_sec: 120,
    max_duration_sec: 600,
    generation_limit: 4,
    cooldown_hours: 8,
    tts_enabled: true,
  },
  holiday: {
    content_types: ["devocional", "reflexao"],
    topics: ["feriado", "família", "descanso espiritual", "paz"],
    voice_style: "calm",
    min_duration_sec: 90,
    max_duration_sec: 360,
    generation_limit: 3,
    cooldown_hours: 6,
    tts_enabled: true,
  },
  special: {
    content_types: ["mensagem_curta"],
    topics: ["mensagem especial"],
    voice_style: "calm",
    min_duration_sec: 60,
    max_duration_sec: 240,
    generation_limit: 2,
    cooldown_hours: 2,
    tts_enabled: true,
  },
};

/* ─── Circuit breaker internals ─────────────────────────────────────────── */

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_WINDOW_MS = 10 * 60 * 1000; // 10 min
const CIRCUIT_RESET_MS = 15 * 60 * 1000;  // 15 min

interface CircuitInternal {
  failures: number;
  lastFailure: number;
  openedAt: number;
  open: boolean;
}

/* ─── AutomationService ──────────────────────────────────────────────────── */

export class AutomationService {
  private isRunning = false;
  private lastRunAt: Date | null = null;
  private lastRunStatus = "idle";
  private lastRunId: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private timerIntervalMs = 30 * 60 * 1000; // 30 min default

  private circuit: Record<"ai" | "tts", CircuitInternal> = {
    ai: { failures: 0, lastFailure: 0, openedAt: 0, open: false },
    tts: { failures: 0, lastFailure: 0, openedAt: 0, open: false },
  };

  /* ── Time period resolution ─────────────────────────────────────────── */

  getTimePeriod(date = new Date()): TimePeriod {
    const dayOfWeek = date.getDay(); // 0 = Sunday
    if (dayOfWeek === 0) return "sunday";

    const hour = date.getHours();
    if (hour >= 0 && hour < 5) return "madrugada";
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 18) return "afternoon";
    if (hour >= 18 && hour < 23) return "evening";
    return "night";
  }

  /* ── Circuit breaker ────────────────────────────────────────────────── */

  isCircuitOpen(provider: "ai" | "tts"): boolean {
    const c = this.circuit[provider];
    if (!c.open) return false;
    // Auto-reset after CIRCUIT_RESET_MS
    if (Date.now() - c.openedAt > CIRCUIT_RESET_MS) {
      logger.info(`AutomationService: circuit ${provider} auto-reset`);
      c.open = false;
      c.failures = 0;
      return false;
    }
    return true;
  }

  recordCircuitSuccess(provider: "ai" | "tts"): void {
    const c = this.circuit[provider];
    c.failures = Math.max(0, c.failures - 1);
    if (c.failures === 0) c.open = false;
  }

  recordCircuitFailure(provider: "ai" | "tts"): void {
    const c = this.circuit[provider];
    const now = Date.now();
    // Reset count if outside window
    if (now - c.lastFailure > CIRCUIT_WINDOW_MS) c.failures = 0;
    c.failures++;
    c.lastFailure = now;
    if (c.failures >= CIRCUIT_FAILURE_THRESHOLD) {
      if (!c.open) {
        c.open = true;
        c.openedAt = now;
        logger.warn(`AutomationService: circuit breaker OPEN for ${provider}`, {
          failures: c.failures,
        });
        realtimeService.broadcastAdmin("automation_failed", {
          reason: `Circuit breaker aberto para ${provider} após ${c.failures} falhas`,
          provider,
          ts: new Date().toISOString(),
        });
      }
    }
  }

  /* ── Rules ──────────────────────────────────────────────────────────── */

  async getRulesForPeriod(
    period: TimePeriod,
    channelId?: number,
  ): Promise<AutomationRule[]> {
    const where: Record<string, unknown> = { period, enabled: true };
    if (channelId !== undefined) {
      where["channel_id"] = { [Op.or]: [channelId, null] };
    }

    const dbRules = await AutomationRule.findAll({ where });

    // If no rules exist for this period, return a default synthetic rule
    if (dbRules.length === 0) {
      const defaults = PERIOD_DEFAULTS[period];
      const synth = AutomationRule.build({
        id: 0,
        channel_id: channelId ?? null,
        period,
        enabled: true,
        generation_limit: 3,
        cooldown_hours: 4,
        auto_generate: true,
        auto_publish: true,
        priority_level: 5,
        ...defaults,
      });
      return [synth];
    }

    return dbRules;
  }

  async getAllRules(): Promise<AutomationRule[]> {
    return AutomationRule.findAll({ order: [["period", "ASC"], ["channel_id", "ASC"]] });
  }

  async upsertRule(
    period: TimePeriod,
    channelId: number | null,
    data: Partial<AutomationRule>,
  ): Promise<AutomationRule> {
    const where = channelId !== null
      ? { period, channel_id: channelId }
      : { period, channel_id: null };

    const [rule] = await AutomationRule.findOrCreate({
      where,
      defaults: {
        period,
        channel_id: channelId,
        enabled: true,
        generation_limit: 3,
        cooldown_hours: 4,
        auto_generate: true,
        auto_publish: true,
        tts_enabled: true,
        priority_level: 5,
        ...PERIOD_DEFAULTS[period],
        ...data,
      },
    });

    await rule.update(data);
    return rule;
  }

  /* ── Anti-repetition ────────────────────────────────────────────────── */

  async getRecentlyPlayedIds(
    channelId: number,
    cooldownHours: number,
  ): Promise<Set<number>> {
    const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
    const plays = await RadioPlay.findAll({
      where: {
        channel_id: channelId,
        played_at: { [Op.gte]: since },
      },
      attributes: ["content_id"],
      raw: true,
    });
    return new Set(
      plays
        .map((p) => (p as unknown as { content_id: number }).content_id)
        .filter(Boolean),
    );
  }

  async getPlaylistContentIds(
    channelId: number,
    date: string,
  ): Promise<Set<number>> {
    const playlist = await Playlist.findOne({ where: { channel_id: channelId, data: date } });
    if (!playlist) return new Set();
    const items = await PlaylistItem.findAll({
      where: { playlist_id: playlist.id },
      attributes: ["content_id"],
      raw: true,
    });
    return new Set(
      items
        .map((i) => (i as unknown as { content_id: number }).content_id)
        .filter(Boolean),
    );
  }

  /* ── Content generation ─────────────────────────────────────────────── */

  private async resolveVoiceId(style: string): Promise<number | null> {
    // Map style to a voice. Prefer voices matching the style keyword
    const voices = await Voice.findAll({ where: { ativo: true } });
    if (voices.length === 0) return null;

    const styleMap: Record<string, string[]> = {
      calm: ["calma", "suave", "tranquila"],
      welcoming: ["acolhedora", "gentil", "suave"],
      meditative: ["meditativa", "calma", "suave"],
      energetic: ["energética", "clara", "forte"],
    };

    const keywords = styleMap[style] ?? [];
    for (const kw of keywords) {
      const match = voices.find((v) =>
        v.nome.toLowerCase().includes(kw.toLowerCase()),
      );
      if (match) return match.id;
    }

    return voices[0]?.id ?? null;
  }

  private pickTopic(rule: AutomationRule, excludeRecent: string[]): string {
    const topics =
      rule.topics.length > 0
        ? rule.topics
        : (PERIOD_DEFAULTS[rule.period as TimePeriod]?.topics ?? ["fé e esperança"]);

    // Prefer topics not recently used
    const fresh = topics.filter((t) => !excludeRecent.includes(t));
    const pool = fresh.length > 0 ? fresh : topics;
    return pool[Math.floor(Math.random() * pool.length)]!;
  }

  private pickContentType(rule: AutomationRule): string {
    const types =
      rule.content_types.length > 0
        ? rule.content_types
        : ["devocional"];
    return types[Math.floor(Math.random() * types.length)]!;
  }

  private async addToPlaylist(
    channelId: number,
    contentId: number,
    date: string,
  ): Promise<void> {
    const [playlist] = await Playlist.findOrCreate({
      where: { channel_id: channelId, data: date },
      defaults: { channel_id: channelId, data: date },
    });

    const lastItem = await PlaylistItem.findOne({
      where: { playlist_id: playlist.id },
      order: [["ordem", "DESC"]],
    });

    const nextOrdem = lastItem ? lastItem.ordem + 1 : 1;
    await PlaylistItem.create({
      playlist_id: playlist.id,
      content_id: contentId,
      ordem: nextOrdem,
      hora_execucao: null,
    });
  }

  private async generateOneContent(
    rule: AutomationRule,
    channelId: number,
    runId: string,
    recentTopics: string[],
  ): Promise<{ contentId: number; costUsd: number } | null> {
    if (this.isCircuitOpen("ai")) {
      logger.warn("AutomationService: AI circuit open, skipping generation");
      return null;
    }

    const topic = this.pickTopic(rule, recentTopics);
    const tipo = this.pickContentType(rule);
    const duracao = Math.floor(
      rule.min_duration_sec +
        Math.random() * (rule.max_duration_sec - rule.min_duration_sec),
    );

    let generatedText: string;
    let generatedTitle: string;
    let tags: string[];
    let aiCost = 0;

    try {
      const generated = await aiService.generateContent({
        tema: topic,
        tipo,
        duracao,
        estilo: this.styleDescription(rule.voice_style),
      });
      generatedText = generated.texto;
      generatedTitle = generated.titulo;
      tags = generated.tags;
      // Rough cost: 0.15 USD/1M tokens, 4 chars/token
      aiCost = (generated.texto.length / 4) * 0.00000015;
      this.recordCircuitSuccess("ai");
    } catch (err) {
      logger.warn("AutomationService: AI generation failed", {
        runId,
        err: (err as Error).message,
      });
      this.recordCircuitFailure("ai");
      return null;
    }

    // Create the Content record
    let content: Content;
    try {
      content = await Content.create({
        titulo: generatedTitle,
        tipo,
        channel_id: channelId,
        tags: [...tags, "automacao", rule.period],
        duracao,
        ativo: true,
        audio_url: null,
        imagem_url: null,
        categoria_id: null,
      });
    } catch (err) {
      logger.error("AutomationService: Content.create failed", {
        runId,
        err: (err as Error).message,
      });
      return null;
    }

    realtimeService.broadcastAdmin("auto_content_generated", {
      runId,
      contentId: content.id,
      titulo: content.titulo,
      tipo: content.tipo,
      channelId,
      period: rule.period,
      ts: new Date().toISOString(),
    });

    // TTS synthesis
    let ttsCost = 0;
    if (rule.tts_enabled && !this.isCircuitOpen("tts") && env.ttsApiKey) {
      try {
        const { voiceService } = await import("./VoiceService.js");
        const voiceId = await this.resolveVoiceId(rule.voice_style);
        if (voiceId) {
          const result = await voiceService.synthesize({
            text: generatedText,
            voiceId,
            contentId: content.id,
          });
          await content.update({ audio_url: result.url });
          ttsCost = (generatedText.length) * 0.000015;
          this.recordCircuitSuccess("tts");
        }
      } catch (err) {
        logger.warn("AutomationService: TTS synthesis failed", {
          runId,
          contentId: content.id,
          err: (err as Error).message,
        });
        this.recordCircuitFailure("tts");
        // Non-fatal: content without audio still goes into playlist
      }
    }

    logger.info("AutomationService: content generated", {
      runId,
      contentId: content.id,
      titulo: content.titulo,
      tipo,
      channelId,
      period: rule.period,
    });

    return { contentId: content.id, costUsd: aiCost + ttsCost };
  }

  private styleDescription(style: string): string {
    const map: Record<string, string> = {
      calm: "calmo, suave e espiritualizado",
      welcoming: "acolhedor, caloroso e esperançoso",
      meditative: "meditativo, profundo e reflexivo",
      energetic: "energético, motivador e edificante",
    };
    return map[style] ?? "espiritual e edificante";
  }

  /* ── Main automation run ────────────────────────────────────────────── */

  async runAutomation(
    triggeredBy: AutomationTrigger = "scheduler",
  ): Promise<AutomationRunResult> {
    if (this.isRunning) {
      logger.warn("AutomationService: already running, skipping");
      return {
        runId: "skipped",
        period: this.getTimePeriod(),
        triggeredBy,
        channelsProcessed: 0,
        contentsGenerated: 0,
        contentsFailed: 0,
        costUsdEst: 0,
        durationMs: 0,
        status: "completed",
        errors: ["Already running"],
      };
    }

    this.isRunning = true;
    const runId = crypto.randomUUID();
    const period = this.getTimePeriod();
    const startTime = Date.now();
    const today = new Date().toISOString().split("T")[0]!;
    const errors: string[] = [];

    let contentsGenerated = 0;
    let contentsFailed = 0;
    let totalCost = 0;

    this.lastRunId = runId;
    this.lastRunStatus = "running";

    realtimeService.broadcastAdmin("automation_started", {
      runId,
      period,
      triggeredBy,
      ts: new Date().toISOString(),
    });

    // Create a log entry
    const log = await AutomationLog.create({
      run_id: runId,
      channel_id: null,
      period,
      triggered_by: triggeredBy,
      status: "running",
      contents_generated: 0,
      contents_failed: 0,
      cost_usd_est: 0,
      duration_ms: null,
      error: null,
    });

    try {
      const activeChannels = await Channel.findAll({
        where: { ativo: true },
        attributes: ["id", "nome"],
      });

      const rules = await this.getRulesForPeriod(period);
      const activeRules = rules.filter((r) => r.auto_generate && r.enabled);

      if (activeRules.length === 0) {
        logger.info("AutomationService: no active rules for period", { period });
        await log.update({
          status: "completed",
          duration_ms: Date.now() - startTime,
          metadata: { message: "no active rules" },
        });
        return this.buildResult(
          runId, period, triggeredBy, activeChannels.length,
          0, 0, 0, Date.now() - startTime, "completed", errors,
        );
      }

      const globalRule = activeRules.find((r) => r.channel_id === null) ?? activeRules[0]!;

      for (const channel of activeChannels) {
        try {
          // Check how many items are already in today's playlist
          const playlistIds = await this.getPlaylistContentIds(channel.id, today);
          const recentIds = await this.getRecentlyPlayedIds(channel.id, globalRule.cooldown_hours);
          const combined = new Set([...playlistIds, ...recentIds]);

          // Determine gap: target at least `generation_limit * 2` items per day slot
          const target = globalRule.generation_limit;
          const available = playlistIds.size;

          if (available >= target * 3) {
            logger.debug("AutomationService: playlist sufficient, skipping channel", {
              channelId: channel.id,
              available,
              target,
            });
            continue;
          }

          const recentTopics: string[] = [];
          let channelGenerated = 0;

          for (let i = 0; i < target && channelGenerated < target; i++) {
            const result = await this.generateOneContent(
              globalRule,
              channel.id,
              runId,
              recentTopics,
            );

            if (result) {
              // Add to today's playlist
              await this.addToPlaylist(channel.id, result.contentId, today);
              combined.add(result.contentId);
              contentsGenerated++;
              channelGenerated++;
              totalCost += result.costUsd;

              realtimeService.broadcastAdmin("auto_playlist_updated", {
                runId,
                channelId: channel.id,
                contentId: result.contentId,
                date: today,
                ts: new Date().toISOString(),
              });
            } else {
              contentsFailed++;
              if (this.isCircuitOpen("ai")) break; // Circuit open → stop trying
            }
          }
        } catch (err) {
          const msg = (err as Error).message;
          errors.push(`Channel ${channel.id}: ${msg}`);
          logger.error("AutomationService: channel run failed", {
            runId,
            channelId: channel.id,
            err: msg,
          });
          contentsFailed++;
        }
      }

      const durationMs = Date.now() - startTime;
      const finalStatus =
        contentsFailed === 0 ? "completed"
        : contentsGenerated > 0 ? "partial"
        : "failed";

      await log.update({
        status: finalStatus,
        contents_generated: contentsGenerated,
        contents_failed: contentsFailed,
        cost_usd_est: totalCost,
        duration_ms: durationMs,
        error: errors.length > 0 ? errors.join("; ") : null,
        metadata: { channelsProcessed: activeChannels.length, period },
      });

      realtimeService.broadcastAdmin("automation_completed", {
        runId,
        period,
        contentsGenerated,
        contentsFailed,
        costUsdEst: totalCost.toFixed(8),
        durationMs,
        status: finalStatus,
        ts: new Date().toISOString(),
      });

      this.lastRunAt = new Date();
      this.lastRunStatus = finalStatus;

      return this.buildResult(
        runId, period, triggeredBy, activeChannels.length,
        contentsGenerated, contentsFailed, totalCost, durationMs,
        finalStatus, errors,
      );
    } catch (err) {
      const msg = (err as Error).message;
      const durationMs = Date.now() - startTime;

      await log.update({
        status: "failed",
        error: msg,
        duration_ms: durationMs,
      });

      realtimeService.broadcastAdmin("automation_failed", {
        runId,
        error: msg,
        durationMs,
        ts: new Date().toISOString(),
      });

      this.lastRunStatus = "failed";

      return this.buildResult(
        runId, period, triggeredBy, 0,
        0, 0, 0, durationMs, "failed", [msg],
      );
    } finally {
      this.isRunning = false;
    }
  }

  private buildResult(
    runId: string,
    period: TimePeriod,
    triggeredBy: AutomationTrigger,
    channelsProcessed: number,
    contentsGenerated: number,
    contentsFailed: number,
    costUsdEst: number,
    durationMs: number,
    status: "completed" | "failed" | "partial",
    errors: string[],
  ): AutomationRunResult {
    return {
      runId,
      period,
      triggeredBy,
      channelsProcessed,
      contentsGenerated,
      contentsFailed,
      costUsdEst,
      durationMs,
      status,
      errors,
    };
  }

  /* ── Timer management ───────────────────────────────────────────────── */

  startTimer(intervalMs = 30 * 60 * 1000): void {
    if (this.timer) return;
    this.timerIntervalMs = intervalMs;
    this.timer = setInterval(async () => {
      logger.info("AutomationService: scheduled run triggered");
      await this.runAutomation("scheduler").catch((err) => {
        logger.error("AutomationService: scheduled run failed", {
          err: (err as Error).message,
        });
      });
    }, intervalMs);

    if ((this.timer as NodeJS.Timeout).unref) {
      (this.timer as NodeJS.Timeout).unref();
    }

    logger.info("AutomationService: timer started", { intervalMs });
  }

  stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("AutomationService: timer stopped");
    }
  }

  /* ── Status ─────────────────────────────────────────────────────────── */

  getStatus(): AutomationServiceStatus {
    const circuitState = (c: CircuitInternal): CircuitState => ({
      open: c.open,
      failures: c.failures,
      lastFailureAt: c.lastFailure ? new Date(c.lastFailure).toISOString() : null,
      opensAt: c.open ? new Date(c.openedAt + CIRCUIT_RESET_MS).toISOString() : null,
    });

    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt ? this.lastRunAt.toISOString() : null,
      lastRunStatus: this.lastRunStatus,
      lastRunId: this.lastRunId,
      currentPeriod: this.getTimePeriod(),
      timerActive: this.timer !== null,
      timerIntervalMs: this.timerIntervalMs,
      circuitBreaker: {
        ai: circuitState(this.circuit.ai),
        tts: circuitState(this.circuit.tts),
      },
    };
  }

  /* ── Recent logs ────────────────────────────────────────────────────── */

  async getRecentLogs(limit = 20): Promise<AutomationLog[]> {
    return AutomationLog.findAll({
      order: [["createdAt", "DESC"]],
      limit,
    });
  }
}

export const automationService = new AutomationService();

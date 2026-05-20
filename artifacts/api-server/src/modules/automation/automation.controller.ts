import type { Request, Response } from "express";
import { Op } from "sequelize";
import { ok, badRequest } from "../../utils/response.js";
import { automationService } from "../../services/AutomationService.js";
import { AutomationLog, AutomationRule } from "../../models/index.js";
import type { TimePeriod } from "../../models/AutomationRule.js";

const VALID_PERIODS: TimePeriod[] = [
  "madrugada",
  "morning",
  "afternoon",
  "evening",
  "night",
  "sunday",
  "holiday",
  "special",
];

/* ─── GET /admin/automation/status ──────────────────────────────────────── */

export async function getStatus(_req: Request, res: Response): Promise<void> {
  const status = automationService.getStatus();

  const [recentLogs, totalGenerated, totalFailed, todayLogs] = await Promise.all([
    automationService.getRecentLogs(10),
    AutomationLog.sum("contents_generated", {}) as unknown as Promise<number>,
    AutomationLog.sum("contents_failed", {}) as unknown as Promise<number>,
    AutomationLog.count({
      where: {
        createdAt: {
          [Op.gte]: new Date(new Date().toISOString().split("T")[0]! + "T00:00:00.000Z"),
        },
      },
    }),
  ]);

  ok(res, {
    ...status,
    stats: {
      totalContentsGenerated: totalGenerated ?? 0,
      totalContentsFailed: totalFailed ?? 0,
      runsToday: todayLogs,
    },
    recentLogs,
    defaultRules: VALID_PERIODS.map((p) => ({
      period: p,
      description: periodDescription(p),
    })),
  });
}

/* ─── GET /admin/automation/rules ───────────────────────────────────────── */

export async function getRules(_req: Request, res: Response): Promise<void> {
  const rules = await automationService.getAllRules();

  // Also return defaults for periods not yet configured
  const configuredPeriods = new Set(rules.map((r) => r.period));
  const missingDefaults = VALID_PERIODS.filter((p) => !configuredPeriods.has(p)).map(
    (p) => ({
      period: p,
      source: "default",
      enabled: true,
      description: periodDescription(p),
    }),
  );

  ok(res, {
    configured: rules,
    defaults: missingDefaults,
    totalPeriods: VALID_PERIODS.length,
    configuredCount: rules.length,
  });
}

/* ─── PUT /admin/automation/rules ───────────────────────────────────────── */

export async function updateRules(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    period?: string;
    channel_id?: number | null;
    rules?: Array<{ period: string; channel_id?: number | null; [key: string]: unknown }>;
    [key: string]: unknown;
  };

  const updates: Array<{ period: TimePeriod; channel_id: number | null; data: Partial<AutomationRule> }> = [];

  // Accept either a single rule or an array of rules
  if (body.rules && Array.isArray(body.rules)) {
    for (const r of body.rules) {
      if (!VALID_PERIODS.includes(r.period as TimePeriod)) {
        badRequest(res, `Período inválido: "${r.period}". Válidos: ${VALID_PERIODS.join(", ")}`);
        return;
      }
      const { period, channel_id, ...data } = r;
      updates.push({ period: period as TimePeriod, channel_id: channel_id ?? null, data });
    }
  } else if (body.period) {
    if (!VALID_PERIODS.includes(body.period as TimePeriod)) {
      badRequest(res, `Período inválido: "${body.period}". Válidos: ${VALID_PERIODS.join(", ")}`);
      return;
    }
    const { period, channel_id, ...data } = body;
    updates.push({
      period: period as TimePeriod,
      channel_id: (channel_id as number | null) ?? null,
      data: data as Partial<AutomationRule>,
    });
  } else {
    badRequest(res, 'Envie "period" + campos a atualizar, ou "rules": [...]');
    return;
  }

  const results = await Promise.all(
    updates.map(({ period, channel_id, data }) =>
      automationService.upsertRule(period, channel_id, data),
    ),
  );

  ok(res, {
    updated: results,
    count: results.length,
  });
}

/* ─── POST /admin/automation/run-now ────────────────────────────────────── */

export async function runNow(req: Request, res: Response): Promise<void> {
  const triggeredBy = "manual" as const;

  // Non-blocking: start the run and return immediately with run_id
  const runIdPreview = `manual-${Date.now()}`;

  // Run async, don't await — return immediately
  automationService
    .runAutomation(triggeredBy)
    .then((result) => {
      void result; // result is broadcast via SSE
    })
    .catch((err) => {
      void err;
    });

  ok(res, {
    message: "Automação iniciada. Acompanhe via SSE /api/realtime/admin.",
    runId: runIdPreview,
    triggeredBy,
    period: automationService.getTimePeriod(),
    ts: new Date().toISOString(),
  });
}

/* ─── POST /admin/automation/run-sync ───────────────────────────────────── */

export async function runSync(_req: Request, res: Response): Promise<void> {
  const result = await automationService.runAutomation("manual");
  ok(res, result);
}

/* ─── GET /admin/automation/logs ────────────────────────────────────────── */

export async function getLogs(req: Request, res: Response): Promise<void> {
  const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
  const period = req.query["period"] as string | undefined;
  const status = req.query["status"] as string | undefined;

  const where: Record<string, unknown> = {};
  if (period) where["period"] = period;
  if (status) where["status"] = status;

  const [logs, total] = await Promise.all([
    AutomationLog.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
    }),
    AutomationLog.count({ where }),
  ]);

  ok(res, { logs, total, limit });
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function periodDescription(period: TimePeriod): string {
  const map: Record<TimePeriod, string> = {
    madrugada: "00:00–04:59 — Instrumental, leitura bíblica, meditação",
    morning: "05:00–11:59 — Devocional, reflexão leve, motivacional",
    afternoon: "12:00–17:59 — Mensagens rápidas, ensinamentos, louvor leve",
    evening: "18:00–22:59 — Oração, voz acolhedora, reflexão profunda",
    night: "23:00–23:59 — Oração, meditação, descanso espiritual",
    sunday: "Domingos — Louvor, pregação, culto familiar",
    holiday: "Feriados — Descanso espiritual, família, paz",
    special: "Eventos especiais — Configurável livremente",
  };
  return map[period];
}

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { redis } from "../config/redis.js";
import { AiEvent } from "../models/index.js";

/* ─── Analytics helpers ───────────────────────────────────────────────────── */

function estimateAiCost(provider: string, charsIn: number): { tokensEst: number; costUsd: number } {
  const tokensEst = Math.round(charsIn / 4);
  const ratesPerToken: Record<string, number> = {
    openai: 0.00000015,     // $0.15/1M (gpt-4o-mini)
    openrouter: 0.0000002,
    gemini: 0.0000001,
    anthropic: 0.00000025,
  };
  return { tokensEst, costUsd: tokensEst * (ratesPerToken[provider] ?? 0.0000002) };
}

function recordAiEvent(opts: {
  charsIn: number;
  durationMs: number;
  success: boolean;
  error?: string;
  contentId?: number;
}): void {
  const { tokensEst, costUsd } = estimateAiCost(env.aiProvider, opts.charsIn);
  AiEvent.create({
    event_type: "ai_generation",
    provider: env.aiProvider,
    model: env.aiModel || undefined,
    chars_in: opts.charsIn,
    tokens_est: tokensEst,
    cost_usd_est: costUsd,
    duration_ms: opts.durationMs,
    success: opts.success,
    error: opts.error ?? null,
    content_id: opts.contentId ?? null,
    audio_duration_sec: null,
  }).catch((err) => {
    logger.debug("AiEvent.create failed (non-fatal)", { err: (err as Error).message });
  });
}

export interface GenerateContentOptions {
  tema: string;
  tipo: string;
  duracao?: number;
  estilo?: string;
}

export interface GeneratedContent {
  titulo: string;
  texto: string;
  tags: string[];
  duracao: number;
}

const PROVIDER_DEFAULTS: Record<string, string> = {
  openai: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
  gemini: "gemini-1.5-flash",
  anthropic: "claude-3-5-haiku-20241022",
};

const AI_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const AI_CACHE_TTL = 3600;

function resolveModel(): string {
  return env.aiModel || PROVIDER_DEFAULTS[env.aiProvider] || "gpt-4o-mini";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): { retryable: boolean; delayMs: number } {
  const status = (err as { status?: number; response?: { status?: number } })?.status
    ?? (err as { status?: number; response?: { status?: number } })?.response?.status
    ?? 0;
  const isTimeout = err instanceof Error && (err.name === "AbortError" || err.message.includes("timeout"));

  if (status === 429) return { retryable: true, delayMs: 10_000 };
  if (status >= 500 && status < 600) return { retryable: true, delayMs: 2_000 };
  if (isTimeout) return { retryable: true, delayMs: 1_000 };
  return { retryable: false, delayMs: 0 };
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const { retryable, delayMs } = isRetryableError(err);
      if (!retryable || attempt === MAX_RETRIES) break;
      const backoff = delayMs * Math.pow(2, attempt - 1);
      logger.warn(`${label}: attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${backoff}ms`, {
        err: err instanceof Error ? err.message : err,
      });
      await sleep(backoff);
    }
  }
  throw lastErr;
}

async function getCached<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch {
    return null;
  }
}

async function setCached(key: string, value: unknown, ttl = AI_CACHE_TTL): Promise<void> {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
  } catch {
    /* ignore cache write errors */
  }
}

function cacheKey(prefix: string, data: unknown): string {
  const hash = crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
  return `${prefix}:${hash}`;
}

const PROVIDER_BASE_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  // OpenAI-compatible endpoint requires /v1beta/ prefix — missing it causes 404
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
};

function buildOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: env.aiApiKey, baseURL: PROVIDER_BASE_URLS[env.aiProvider] });
}

/** Logs the effective config before each AI call — safe (key truncated to 8 chars). */
function logAiCallConfig(label: string): void {
  const keyPreview = env.aiApiKey ? `${env.aiApiKey.slice(0, 8)}…` : "(não definida)";
  const baseUrl = PROVIDER_BASE_URLS[env.aiProvider] ?? "(openai default)";
  logger.info(`${label}: config`, {
    provider: env.aiProvider,
    model: resolveModel(),
    endpoint: baseUrl,
    apiKeyPrefix: keyPreview,
  });
}

async function chatOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = buildOpenAIClient();
  const model = resolveModel();
  logAiCallConfig("chatOpenAI");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      },
      { signal: controller.signal },
    );
    return response.choices[0]?.message.content?.trim() ?? "";
  } catch (err) {
    // Capture the full API error body for debugging
    const apiErr = err as {
      status?: number;
      message?: string;
      error?: unknown;
      headers?: unknown;
    };
    logger.error("chatOpenAI: API error", {
      provider: env.aiProvider,
      model,
      status: apiErr.status,
      message: apiErr.message,
      errorBody: apiErr.error,
    });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function chatAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: env.aiApiKey });
  const model = resolveModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await client.messages.create(
      {
        model,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      },
      { signal: controller.signal },
    );
    const block = response.content[0];
    return block?.type === "text" ? block.text.trim() : "";
  } finally {
    clearTimeout(timer);
  }
}

async function chat(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!env.aiApiKey) {
    throw new Error("AI_API_KEY não configurado — defina a variável de ambiente antes de usar o AiService");
  }
  const fn = env.aiProvider === "anthropic"
    ? () => chatAnthropic(systemPrompt, userPrompt)
    : () => chatOpenAI(systemPrompt, userPrompt);

  return withRetry(fn, `AiService.chat[${env.aiProvider}]`);
}

const SYSTEM_BASE =
  "Você é um assistente especializado em criação de conteúdo para rádio espiritual cristã. " +
  "Produza conteúdo edificante, bíblico e acessível ao grande público. " +
  "Responda sempre em português do Brasil.";

export class AiService {
  async generateContent(opts: GenerateContentOptions): Promise<GeneratedContent> {
    const key = cacheKey("ai:content", opts);
    const cached = await getCached<GeneratedContent>(key);
    if (cached) {
      logger.info("AiService.generateContent: cache hit", { key });
      return cached;
    }

    logger.info("AiService.generateContent", { provider: env.aiProvider, model: resolveModel(), opts });

    const duracaoSegundos = opts.duracao ?? 120;
    const duracaoMinutos = Math.ceil(duracaoSegundos / 60);
    const estilo = opts.estilo ?? "espiritual e edificante";

    const userPrompt =
      `Crie um conteúdo de rádio espiritual do tipo "${opts.tipo}" sobre o tema "${opts.tema}".\n` +
      `Estilo: ${estilo}.\n` +
      `Duração aproximada: ${duracaoMinutos} minuto(s) (${duracaoSegundos} segundos).\n\n` +
      `Responda SOMENTE com um JSON válido no formato:\n` +
      `{\n` +
      `  "titulo": "título chamativo e espiritual",\n` +
      `  "texto": "texto completo do conteúdo, pronto para ser lido no rádio",\n` +
      `  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]\n` +
      `}\n\nNão inclua nada fora do JSON.`;

    const t0 = Date.now();
    let raw: string;
    try {
      raw = await chat(SYSTEM_BASE, userPrompt);
    } catch (err) {
      recordAiEvent({ charsIn: userPrompt.length, durationMs: Date.now() - t0, success: false, error: (err as Error).message });
      throw err;
    }

    let parsed: { titulo: string; texto: string; tags: string[] };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as typeof parsed;
    } catch (err) {
      recordAiEvent({ charsIn: userPrompt.length, durationMs: Date.now() - t0, success: false, error: "JSON parse failed" });
      logger.error("AiService.generateContent: falha ao parsear JSON da IA", { raw, err });
      throw new Error("A IA retornou um formato inválido — tente novamente");
    }

    const result: GeneratedContent = {
      titulo: parsed.titulo,
      texto: parsed.texto,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [opts.tema, opts.tipo],
      duracao: duracaoSegundos,
    };

    recordAiEvent({ charsIn: userPrompt.length, durationMs: Date.now() - t0, success: true });
    await setCached(key, result);
    return result;
  }

  async generateScript(tema: string, duracao: number): Promise<string> {
    const key = cacheKey("ai:script", { tema, duracao });
    const cached = await getCached<string>(key);
    if (cached) {
      logger.info("AiService.generateScript: cache hit", { key });
      return cached;
    }

    logger.info("AiService.generateScript", { provider: env.aiProvider, model: resolveModel(), tema, duracao });

    const minutos = Math.ceil(duracao / 60);
    const userPrompt =
      `Crie um roteiro completo para um programa de rádio espiritual cristão sobre o tema: "${tema}".\n` +
      `Duração alvo: ${minutos} minuto(s) (aproximadamente ${duracao} segundos).\n\n` +
      `O roteiro deve incluir:\n` +
      `- Abertura (saudação e apresentação do tema)\n` +
      `- Desenvolvimento (mensagem principal com referências bíblicas quando apropriado)\n` +
      `- Encerramento (oração ou bênção)\n\n` +
      `Escreva o texto completo, pronto para ser narrado, sem marcadores de cena ou indicações técnicas.`;

    const t1 = Date.now();
    let result: string;
    try {
      result = await chat(SYSTEM_BASE, userPrompt);
    } catch (err) {
      recordAiEvent({ charsIn: userPrompt.length, durationMs: Date.now() - t1, success: false, error: (err as Error).message });
      throw err;
    }
    recordAiEvent({ charsIn: userPrompt.length, durationMs: Date.now() - t1, success: true });
    await setCached(key, result);
    return result;
  }

  async summarize(text: string): Promise<string> {
    logger.info("AiService.summarize", { provider: env.aiProvider, model: resolveModel(), length: text.length });

    const userPrompt =
      `Crie um resumo conciso do seguinte conteúdo espiritual, em no máximo 3 frases.\n` +
      `O resumo deve capturar a essência da mensagem e ser adequado para uso como descrição em um app de rádio.\n\n` +
      `Conteúdo:\n${text}`;

    const t2 = Date.now();
    let result: string;
    try {
      result = await chat(SYSTEM_BASE, userPrompt);
    } catch (err) {
      recordAiEvent({ charsIn: text.length, durationMs: Date.now() - t2, success: false, error: (err as Error).message });
      throw err;
    }
    recordAiEvent({ charsIn: text.length, durationMs: Date.now() - t2, success: true });
    return result;
  }
}

export const aiService = new AiService();

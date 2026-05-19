import OpenAI from "openai";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

const VALID_VOICES = ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"] as const;
type OpenAIVoice = (typeof VALID_VOICES)[number];

const TTS_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveVoice(nome: string): OpenAIVoice {
  const lower = nome.toLowerCase() as OpenAIVoice;
  return VALID_VOICES.includes(lower) ? lower : "nova";
}

export async function synthesizeOpenAI(text: string, voiceIdentifier: string): Promise<Buffer> {
  const client = new OpenAI({ apiKey: env.ttsApiKey });
  const model = (env.ttsModel || "tts-1") as "tts-1" | "tts-1-hd";
  const voice = resolveVoice(voiceIdentifier);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
    try {
      const response = await client.audio.speech.create(
        { model, voice, input: text, response_format: "mp3" },
        { signal: controller.signal },
      );
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status ?? 0;
      const isTimeout = err instanceof Error && err.name === "AbortError";
      const isRetryable = status === 429 || (status >= 500 && status < 600) || isTimeout;

      if (!isRetryable || attempt === MAX_RETRIES) break;
      const delay = status === 429 ? 10_000 : Math.pow(2, attempt) * 1000;
      logger.warn(`OpenAI TTS: attempt ${attempt} failed (${status}), retrying in ${delay}ms`);
      await sleep(delay);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

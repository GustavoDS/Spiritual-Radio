import { ElevenLabsClient } from "elevenlabs";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

const DEFAULT_MODEL = "eleven_multilingual_v2";
const TTS_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function synthesizeElevenLabs(text: string, voiceId: string): Promise<Buffer> {
  const client = new ElevenLabsClient({ apiKey: env.ttsApiKey });
  const modelId = env.ttsModel || DEFAULT_MODEL;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
    try {
      const stream = await client.textToSpeech.convert(voiceId, {
        text,
        model_id: modelId,
        output_format: "mp3_44100_128",
      });

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        if (controller.signal.aborted) throw new Error("ElevenLabs TTS timeout");
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number; statusCode?: number }).status
        ?? (err as { status?: number; statusCode?: number }).statusCode
        ?? 0;
      const isTimeout = err instanceof Error && (err.name === "AbortError" || err.message.includes("timeout"));
      const isRetryable = status === 429 || (status >= 500 && status < 600) || isTimeout;

      if (!isRetryable || attempt === MAX_RETRIES) break;
      const delay = status === 429 ? 15_000 : Math.pow(2, attempt) * 2_000;
      logger.warn(`ElevenLabs TTS: attempt ${attempt} failed (${status}), retrying in ${delay}ms`);
      await sleep(delay);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

import OpenAI from "openai";
import { env } from "../../config/env.js";

const VALID_VOICES = ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"] as const;
type OpenAIVoice = (typeof VALID_VOICES)[number];

function resolveVoice(nome: string): OpenAIVoice {
  const lower = nome.toLowerCase() as OpenAIVoice;
  return VALID_VOICES.includes(lower) ? lower : "nova";
}

export async function synthesizeOpenAI(text: string, voiceNome: string): Promise<Buffer> {
  const client = new OpenAI({ apiKey: env.ttsApiKey });
  const model = (env.ttsModel || "tts-1") as "tts-1" | "tts-1-hd";
  const voice = resolveVoice(voiceNome);

  const response = await client.audio.speech.create({
    model,
    voice,
    input: text,
    response_format: "mp3",
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

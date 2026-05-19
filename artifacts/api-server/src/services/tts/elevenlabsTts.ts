import { ElevenLabsClient } from "elevenlabs";
import { env } from "../../config/env.js";

const DEFAULT_MODEL = "eleven_multilingual_v2";

export async function synthesizeElevenLabs(text: string, voiceId: string): Promise<Buffer> {
  const client = new ElevenLabsClient({ apiKey: env.ttsApiKey });
  const modelId = env.ttsModel || DEFAULT_MODEL;

  const stream = await client.textToSpeech.convert(voiceId, {
    text,
    model_id: modelId,
    output_format: "mp3_44100_128",
  });

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

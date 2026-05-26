import fs from "node:fs";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { Op } from "sequelize";
import { Vinheta, VinhetaExecucao, Voice, BackgroundTrack } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { storageProvider } from "../../storage/index.js";
import { synthesizeElevenLabs } from "../../services/tts/elevenlabsTts.js";
import { synthesizeOpenAI } from "../../services/tts/openaiTts.js";
import { vinhetasSfxService } from "./vinhetas-sfx.service.js";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import type { BlocoVinheta, TipoVinheta } from "../../models/Vinheta.js";
import { TIPOS_VINHETA } from "../../models/Vinheta.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VinhetaFilters {
  channel_id?: number;
  bloco?: string;
  tipo_vinheta?: string;
  ativo?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateVinhetaInput {
  channel_id?: number | null;
  nome: string;
  texto: string;
  bloco: BlocoVinheta;
  tipo_vinheta: TipoVinheta;
  voice_id?: string | null;
  ativo?: boolean;
  prioridade?: number;
  background_track_id?: string | null;
  sfx_intro_url?: string | null;
  sfx_outro_url?: string | null;
  bed_volume_db?: number;
  ducking_enabled?: boolean;
}

const ANTI_REPEAT_N = 3;
const execFileAsync = promisify(execFile);

/** Volume dos stingers SFX (intro/outro) no concat final. Ajuste aqui para tuning. */
const SFX_STINGER_VOLUME_DB = -6;

// ---------------------------------------------------------------------------
// Seed data: 9 blocos × 6 tipos = 54 vinhetas padrão
// ---------------------------------------------------------------------------

interface SeedItem {
  bloco: BlocoVinheta;
  tipo_vinheta: TipoVinheta;
  nome: string;
  texto: string;
}

const SEED_DATA: SeedItem[] = [
  // MADRUGADA
  { bloco: "madrugada", tipo_vinheta: "abertura",           nome: "Madrugada – Abertura",          texto: "Na quietude da madrugada, você está ouvindo a Rádio Espiritual. Que este momento seja de paz e renovação para seu coração." },
  { bloco: "madrugada", tipo_vinheta: "transicao",          nome: "Madrugada – Transição",          texto: "Que a presença de Deus cubra você nesta madrugada silenciosa." },
  { bloco: "madrugada", tipo_vinheta: "encerramento",       nome: "Madrugada – Encerramento",       texto: "Que Deus vele por você enquanto descansa. Uma boa madrugada e até logo." },
  { bloco: "madrugada", tipo_vinheta: "antes_de_oracao",    nome: "Madrugada – Antes da Oração",    texto: "Na quietude desta madrugada, vamos levar nosso coração ao Senhor em oração." },
  { bloco: "madrugada", tipo_vinheta: "antes_de_mensagem",  nome: "Madrugada – Antes da Mensagem",  texto: "Uma palavra especial para você nesta madrugada. Ouça com seu coração." },
  { bloco: "madrugada", tipo_vinheta: "antes_de_versiculo", nome: "Madrugada – Antes do Versículo", texto: "Uma promessa de Deus para fortalecer seu coração nesta madrugada." },
  // AMANHECER
  { bloco: "amanhecer", tipo_vinheta: "abertura",           nome: "Amanhecer – Abertura",          texto: "O sol está nascendo e com ele novas misericórdias. Bom dia! Você está ouvindo a Rádio Espiritual, sua companhia neste lindo amanhecer." },
  { bloco: "amanhecer", tipo_vinheta: "transicao",          nome: "Amanhecer – Transição",          texto: "O amanhecer traz novas misericórdias. Continue conosco e que Deus abençoe seu dia." },
  { bloco: "amanhecer", tipo_vinheta: "encerramento",       nome: "Amanhecer – Encerramento",       texto: "O dia começa cheio de graça. Deus vai à sua frente. Tenha um dia abençoado!" },
  { bloco: "amanhecer", tipo_vinheta: "antes_de_oracao",    nome: "Amanhecer – Antes da Oração",    texto: "No início deste novo dia, vamos unir nossos corações em oração." },
  { bloco: "amanhecer", tipo_vinheta: "antes_de_mensagem",  nome: "Amanhecer – Antes da Mensagem",  texto: "Uma mensagem para começar seu dia cheio de esperança e fé." },
  { bloco: "amanhecer", tipo_vinheta: "antes_de_versiculo", nome: "Amanhecer – Antes do Versículo", texto: "A Palavra de Deus para iluminar o seu amanhecer." },
  // MANHÃ
  { bloco: "manha", tipo_vinheta: "abertura",           nome: "Manhã – Abertura",          texto: "Bom dia! Você está ouvindo a Rádio Espiritual. Uma palavra de fé para começar seu dia com alegria e esperança." },
  { bloco: "manha", tipo_vinheta: "transicao",          nome: "Manhã – Transição",          texto: "Continue conosco. Ainda temos muito de especial para você nesta manhã abençoada." },
  { bloco: "manha", tipo_vinheta: "encerramento",       nome: "Manhã – Encerramento",       texto: "A manhã foi de muita graça. Continue seu dia com Deus no coração." },
  { bloco: "manha", tipo_vinheta: "antes_de_oracao",    nome: "Manhã – Antes da Oração",    texto: "Vamos parar um momento e levar ao Senhor as necessidades desta manhã." },
  { bloco: "manha", tipo_vinheta: "antes_de_mensagem",  nome: "Manhã – Antes da Mensagem",  texto: "E agora, uma mensagem de edificação para fortalecer sua fé nesta manhã." },
  { bloco: "manha", tipo_vinheta: "antes_de_versiculo", nome: "Manhã – Antes do Versículo", texto: "A Palavra de Deus para o seu coração nesta manhã." },
  // ALMOÇO
  { bloco: "almoco", tipo_vinheta: "abertura",           nome: "Almoço – Abertura",          texto: "No meio do dia, uma pausa para a alma. Você está ouvindo a Rádio Espiritual. Que este momento seja de paz e gratidão." },
  { bloco: "almoco", tipo_vinheta: "transicao",          nome: "Almoço – Transição",          texto: "Continue conosco durante a sua pausa do almoço. Que Deus renove suas forças." },
  { bloco: "almoco", tipo_vinheta: "encerramento",       nome: "Almoço – Encerramento",       texto: "Que o resto do dia seja cheio da graça e da provisão de Deus. Até logo!" },
  { bloco: "almoco", tipo_vinheta: "antes_de_oracao",    nome: "Almoço – Antes da Oração",    texto: "Momento de agradecer ao Senhor pelo sustento e pelas bênçãos do dia." },
  { bloco: "almoco", tipo_vinheta: "antes_de_mensagem",  nome: "Almoço – Antes da Mensagem",  texto: "Uma palavra especial para recarregar sua fé no meio do dia." },
  { bloco: "almoco", tipo_vinheta: "antes_de_versiculo", nome: "Almoço – Antes do Versículo", texto: "Um versículo de Deus para acompanhar este momento de pausa." },
  // TARDE
  { bloco: "tarde", tipo_vinheta: "abertura",           nome: "Tarde – Abertura",          texto: "A tarde pede calma e fé. Você está ouvindo a Rádio Espiritual. Uma boa tarde para você!" },
  { bloco: "tarde", tipo_vinheta: "transicao",          nome: "Tarde – Transição",          texto: "Continue conosco nesta tarde abençoada. Deus cuida de cada detalhe da sua vida." },
  { bloco: "tarde", tipo_vinheta: "encerramento",       nome: "Tarde – Encerramento",       texto: "A tarde foi de graça. Que a noite traga ainda mais paz e descanso para você." },
  { bloco: "tarde", tipo_vinheta: "antes_de_oracao",    nome: "Tarde – Antes da Oração",    texto: "Vamos orar juntos e buscar a presença de Deus nesta tarde." },
  { bloco: "tarde", tipo_vinheta: "antes_de_mensagem",  nome: "Tarde – Antes da Mensagem",  texto: "Uma mensagem para renovar suas forças e sua fé nesta tarde." },
  { bloco: "tarde", tipo_vinheta: "antes_de_versiculo", nome: "Tarde – Antes do Versículo", texto: "A Palavra de Deus para iluminar a sua tarde." },
  // PRIME
  { bloco: "prime", tipo_vinheta: "abertura",           nome: "Prime – Abertura",          texto: "É hora de adorar! Você está ouvindo a Rádio Espiritual. Eleve seu coração ao Senhor neste momento especial!" },
  { bloco: "prime", tipo_vinheta: "transicao",          nome: "Prime – Transição",          texto: "Continue adorando. Nosso Deus é digno de toda honra, glória e louvor!" },
  { bloco: "prime", tipo_vinheta: "encerramento",       nome: "Prime – Encerramento",       texto: "Foi um lindo momento de adoração. Que Deus seja glorificado em tudo. Até logo!" },
  { bloco: "prime", tipo_vinheta: "antes_de_oracao",    nome: "Prime – Antes da Oração",    texto: "Vamos juntos ao trono da graça em oração. Nosso Deus ouve e responde." },
  { bloco: "prime", tipo_vinheta: "antes_de_mensagem",  nome: "Prime – Antes da Mensagem",  texto: "Uma poderosa mensagem para este momento prime. Prepare seu coração." },
  { bloco: "prime", tipo_vinheta: "antes_de_versiculo", nome: "Prime – Antes do Versículo", texto: "A Palavra viva de Deus para o seu coração agora." },
  // NOITE
  { bloco: "noite", tipo_vinheta: "abertura",           nome: "Noite – Abertura",          texto: "A noite chegou. Você está ouvindo a Rádio Espiritual. Que a paz de Deus que excede todo entendimento repouse sobre você." },
  { bloco: "noite", tipo_vinheta: "transicao",          nome: "Noite – Transição",          texto: "Continue conosco nesta noite de bênçãos. Deus está aqui com você." },
  { bloco: "noite", tipo_vinheta: "encerramento",       nome: "Noite – Encerramento",       texto: "Boa noite! Que Deus guarde seu sono, renove suas forças e que amanhã seja ainda mais abençoado." },
  { bloco: "noite", tipo_vinheta: "antes_de_oracao",    nome: "Noite – Antes da Oração",    texto: "Encerrando este dia colocando tudo nas mãos de Deus em oração." },
  { bloco: "noite", tipo_vinheta: "antes_de_mensagem",  nome: "Noite – Antes da Mensagem",  texto: "Uma mensagem especial para o encerramento do seu dia. Ouça com fé." },
  { bloco: "noite", tipo_vinheta: "antes_de_versiculo", nome: "Noite – Antes do Versículo", texto: "Uma promessa de Deus para encerrar este dia com fé e esperança." },
  // DEVOCIONAL
  { bloco: "devocional", tipo_vinheta: "abertura",           nome: "Devocional – Abertura",          texto: "Momento de intimidade com Deus. Você está ouvindo a Rádio Espiritual. Prepare seu coração para este tempo especial." },
  { bloco: "devocional", tipo_vinheta: "transicao",          nome: "Devocional – Transição",          texto: "Permaneça neste momento precioso com Deus. Ele tem algo a falar ao seu coração." },
  { bloco: "devocional", tipo_vinheta: "encerramento",       nome: "Devocional – Encerramento",       texto: "Que este devocional tenha tocado profundamente o seu coração. Deus te ama com amor eterno." },
  { bloco: "devocional", tipo_vinheta: "antes_de_oracao",    nome: "Devocional – Antes da Oração",    texto: "Vamos ao encontro de Deus em oração. Ele está esperando por você." },
  { bloco: "devocional", tipo_vinheta: "antes_de_mensagem",  nome: "Devocional – Antes da Mensagem",  texto: "Uma profunda mensagem devocional para nutrir sua alma e fortalecer sua fé." },
  { bloco: "devocional", tipo_vinheta: "antes_de_versiculo", nome: "Devocional – Antes do Versículo", texto: "A Palavra de Deus para sua meditação e contemplação." },
  // SLEEP
  { bloco: "sleep", tipo_vinheta: "abertura",           nome: "Sleep – Abertura",          texto: "Descanse. Você está seguro nas mãos do Pai. Esta é a Rádio Espiritual, sua companhia para um sono de paz." },
  { bloco: "sleep", tipo_vinheta: "transicao",          nome: "Sleep – Transição",          texto: "Que esta música suave cuide do seu sono. Você está protegido." },
  { bloco: "sleep", tipo_vinheta: "encerramento",       nome: "Sleep – Encerramento",       texto: "Que os anjos de Deus guardem seu sono esta noite. Até amanhã com mais fé!" },
  { bloco: "sleep", tipo_vinheta: "antes_de_oracao",    nome: "Sleep – Antes da Oração",    texto: "Uma oração suave para você adormecer envolto na paz de Deus." },
  { bloco: "sleep", tipo_vinheta: "antes_de_mensagem",  nome: "Sleep – Antes da Mensagem",  texto: "Uma palavra gentil e reconfortante para seu descanso." },
  { bloco: "sleep", tipo_vinheta: "antes_de_versiculo", nome: "Sleep – Antes do Versículo", texto: "Uma promessa de paz de Deus para você adormecer com tranquilidade." },
];

// ---------------------------------------------------------------------------
// ffmpeg helpers
// ---------------------------------------------------------------------------

interface MixAssets {
  voicePath: string;
  introPath?: string;
  outroPath?: string;
  bedPath?: string;
}

/**
 * Builds ffmpeg argument array for the vinheta mix pipeline.
 * Input order: [intro?] voice [bed?] [outro?]
 * Handles all combinations of assets dynamically.
 */
function buildFfmpegArgs(assets: MixAssets, bedVolumeDb: number, duckingEnabled: boolean, outputPath: string): string[] {
  const { voicePath, introPath, outroPath, bedPath } = assets;
  const hasIntro = !!introPath;
  const hasOutro = !!outroPath;
  const hasBed = !!bedPath;

  const args: string[] = ["-y"];

  // Track input order for index references in filter_complex
  type InputName = "intro" | "voice" | "bed" | "outro";
  const inputList: InputName[] = [];
  if (hasIntro) inputList.push("intro");
  inputList.push("voice");
  if (hasBed) inputList.push("bed");
  if (hasOutro) inputList.push("outro");

  const idx = (name: InputName) => inputList.indexOf(name);

  if (hasIntro) args.push("-i", introPath!);
  args.push("-i", voicePath);
  if (hasBed) args.push("-i", bedPath!);
  if (hasOutro) args.push("-i", outroPath!);

  // --- Voice only: use simple -af ---
  if (!hasIntro && !hasOutro && !hasBed) {
    args.push("-af", "loudnorm=I=-16:LRA=11:TP=-1.5");
    args.push("-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", outputPath);
    return args;
  }

  // --- Complex filter_complex ---
  const filters: string[] = [];
  let voiceStream = `[${idx("voice")}:a]`;

  if (hasBed) {
    filters.push(`[${idx("bed")}:a]aloop=loop=-1:size=2000000000,volume=${bedVolumeDb}dB[bedloop]`);
    if (duckingEnabled) {
      filters.push(`${voiceStream}[bedloop]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=300[bedmixed]`);
    } else {
      filters.push(`${voiceStream}[bedloop]amix=inputs=2:duration=first:weights=1 0.4[bedmixed]`);
    }
    filters.push("[bedmixed]apad=pad_dur=0.3[bedded]");
    voiceStream = "[bedded]";
  }

  // Attenuate stingers before concat so they sit as "signatures", not bursts
  // Concat: [intro_vol?] [voice/bedded] [outro_vol?]
  const concatParts: string[] = [];
  if (hasIntro) {
    filters.push(`[${idx("intro")}:a]volume=${SFX_STINGER_VOLUME_DB}dB[intro_vol]`);
    concatParts.push("[intro_vol]");
  }
  concatParts.push(voiceStream);
  if (hasOutro) {
    filters.push(`[${idx("outro")}:a]volume=${SFX_STINGER_VOLUME_DB}dB[outro_vol]`);
    concatParts.push("[outro_vol]");
  }

  let preNorm: string;
  if (concatParts.length === 1) {
    preNorm = concatParts[0]!;
  } else {
    filters.push(`${concatParts.join("")}concat=n=${concatParts.length}:v=0:a=1[catted]`);
    preNorm = "[catted]";
  }
  filters.push(`${preNorm}loudnorm=I=-16:LRA=11:TP=-1.5[out]`);

  args.push("-filter_complex", filters.join(";"));
  args.push("-map", "[out]");
  args.push("-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", outputPath);
  return args;
}

async function runFfmpeg(args: string[]): Promise<void> {
  try {
    await execFileAsync("ffmpeg", args, { maxBuffer: 100 * 1024 * 1024 });
  } catch (err) {
    const stderr = ((err as { stderr?: string }).stderr ?? "").slice(0, 800);
    throw new Error(`ffmpeg failed: ${stderr || String(err)}`);
  }
}

function probeDuration(filePath: string): number {
  try {
    const out = execFileSync("ffprobe", [
      "-v", "quiet", "-print_format", "json", "-show_format", filePath,
    ], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(out) as { format?: { duration?: string } };
    const d = Number(parsed.format?.duration ?? "0");
    if (d > 0) return Math.ceil(d);
  } catch { /* fall through */ }
  // Fallback: estimate from file size (MP3 at 192kbps ≈ 24 KB/sec)
  try {
    const stats = fs.statSync(filePath);
    return Math.max(1, Math.ceil(stats.size / 24000));
  } catch {
    return 10;
  }
}

/**
 * Download a URL or copy a local path to destPath.
 * Returns true on success, false on any error (caller should handle gracefully).
 */
async function fetchAssetToFile(url: string, destPath: string): Promise<boolean> {
  if (!url) return false;
  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) {
        logger.warn("fetchAssetToFile: HTTP error", { url, status: res.status });
        return false;
      }
      fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
      return true;
    }
    // Local path — resolve against uploadDir
    const localPath = url.startsWith("/") ? url : path.join(env.uploadDir, url.replace(/^\//, ""));
    if (!fs.existsSync(localPath)) {
      logger.warn("fetchAssetToFile: local file not found", { localPath });
      return false;
    }
    fs.copyFileSync(localPath, destPath);
    return true;
  } catch (err) {
    logger.warn("fetchAssetToFile: error", { url, err: (err as Error).message });
    return false;
  }
}

async function runConcurrent<T>(items: T[], fn: (item: T) => Promise<void>, concurrency: number): Promise<void> {
  const queue = [...items];
  const worker = async () => {
    let item: T | undefined;
    while ((item = queue.shift()) !== undefined) {
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class VinhetasService {
  // --- CRUD ---

  async findAll(filters: VinhetaFilters = {}) {
    const where: Record<string, unknown> = {};
    if (filters.channel_id !== undefined) where["channel_id"] = filters.channel_id;
    if (filters.bloco) where["bloco"] = filters.bloco;
    if (filters.tipo_vinheta) where["tipo_vinheta"] = filters.tipo_vinheta;
    if (filters.ativo !== undefined) where["ativo"] = filters.ativo;

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, filters.limit ?? 50);
    const offset = (page - 1) * limit;

    const { count, rows } = await Vinheta.findAndCountAll({
      where,
      order: [["bloco", "ASC"], ["tipo_vinheta", "ASC"], ["prioridade", "DESC"], ["id", "ASC"]],
      limit,
      offset,
    });
    return { items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) };
  }

  async findById(id: number): Promise<Vinheta> {
    const v = await Vinheta.findByPk(id);
    if (!v) throw new HttpError("Vinheta não encontrada", 404);
    return v;
  }

  async create(data: CreateVinhetaInput): Promise<Vinheta> {
    return Vinheta.create(data as unknown as Parameters<typeof Vinheta.create>[0]);
  }

  async update(id: number, data: Partial<CreateVinhetaInput>): Promise<Vinheta> {
    const v = await this.findById(id);
    await v.update(data);
    return v;
  }

  async remove(id: number): Promise<{ id: number }> {
    const v = await this.findById(id);
    await v.destroy();
    return { id };
  }

  // --- Audio pipeline ---

  /**
   * Full generation pipeline:
   *  1. TTS synthesis (ElevenLabs / OpenAI)
   *  2. Resolve SFX (from vinheta or catalog — generates on-demand if needed)
   *  3. Resolve bed track (from background_track FK)
   *  4. Download SFX + bed to /tmp
   *  5. ffmpeg dynamic mix (intro + voice + outro, with optional bed+ducking)
   *  6. loudnorm to -16 LUFS
   *  7. Upload final MP3 to storage → vinhetas/final/{id}_{ts}_mix.mp3
   *  8. Measure duration via ffprobe
   *  9. Persist audio_url + duracao_sec
   */
  async gerarAudio(id: number): Promise<Vinheta> {
    const v = await Vinheta.findByPk(id, {
      include: [{ model: BackgroundTrack, as: "background_track" }],
    });
    if (!v) throw new HttpError("Vinheta não encontrada", 404);

    // 1. Resolve voice
    let voice: Voice | null = null;
    if (v.voice_id) {
      voice = await Voice.findOne({ where: { voice_id_externo: v.voice_id, ativo: true } });
    }
    if (!voice) {
      voice = await Voice.findOne({
        where: { provider: "elevenlabs", ativo: true },
        order: [["id", "ASC"]],
      });
    }
    if (!voice) {
      voice = await Voice.findOne({ where: { ativo: true }, order: [["id", "ASC"]] });
    }
    if (!voice) {
      throw new HttpError("Nenhuma voz disponível para síntese TTS. Cadastre uma voz primeiro.", 422);
    }

    const ts = Date.now();
    logger.info("VinhetasService.gerarAudio: step 1/5 — TTS synthesis", {
      vinhetaId: id, voiceId: voice.id, textLen: v.texto.length,
    });

    // 2. Synthesize TTS → buffer (we keep raw buffer, not uploaded, to use directly in ffmpeg)
    const provider = voice.provider === "elevenlabs" ? "elevenlabs" : env.ttsProvider;
    const voiceIdentifier = voice.voice_id_externo ?? voice.nome;
    let audioBuffer: Buffer;
    try {
      if (provider === "elevenlabs") {
        audioBuffer = await synthesizeElevenLabs(v.texto, voiceIdentifier);
      } else {
        audioBuffer = await synthesizeOpenAI(v.texto, voiceIdentifier);
      }
    } catch (err) {
      throw new HttpError(`Falha na síntese TTS: ${(err as Error).message}`, 502);
    }

    const voicePath = `/tmp/vinheta_${id}_${ts}_voice.mp3`;
    fs.writeFileSync(voicePath, audioBuffer);

    // 3. Resolve SFX
    let sfxIntroUrl = v.sfx_intro_url;
    if (!sfxIntroUrl) {
      const sfx = await vinhetasSfxService.getOrGenerateSfx(v.tipo_vinheta as TipoVinheta);
      sfxIntroUrl = sfx.intro_url;
    }
    const sfxOutroUrl = v.sfx_outro_url ?? null;

    // 4. Resolve bed
    const bedTrack = (v as unknown as { background_track?: { url?: string } }).background_track;
    const bedUrl = bedTrack?.url ?? null;

    logger.info("VinhetasService.gerarAudio: step 2/5 — asset resolution", {
      vinhetaId: id, sfxIntroUrl: !!sfxIntroUrl, sfxOutroUrl: !!sfxOutroUrl, bedUrl: !!bedUrl,
    });

    // 5. Download assets to /tmp
    const introDest = `/tmp/vinheta_${id}_${ts}_intro.mp3`;
    const outroDest = `/tmp/vinheta_${id}_${ts}_outro.mp3`;
    const bedDest = `/tmp/vinheta_${id}_${ts}_bed.mp3`;

    const finalDir = path.join(env.uploadDir, "vinhetas", "final");
    fs.mkdirSync(finalDir, { recursive: true });
    const outputPath = path.join(finalDir, `${id}_${ts}_mix.mp3`);

    const tmpFiles: string[] = [voicePath];
    try {
      const gotIntro = sfxIntroUrl ? await fetchAssetToFile(sfxIntroUrl, introDest) : false;
      if (gotIntro) tmpFiles.push(introDest);

      const gotOutro = sfxOutroUrl ? await fetchAssetToFile(sfxOutroUrl, outroDest) : false;
      if (gotOutro) tmpFiles.push(outroDest);

      const gotBed = bedUrl ? await fetchAssetToFile(bedUrl, bedDest) : false;
      if (gotBed) tmpFiles.push(bedDest);

      // 6. Build and run ffmpeg
      const assets: MixAssets = {
        voicePath,
        introPath: gotIntro ? introDest : undefined,
        outroPath: gotOutro ? outroDest : undefined,
        bedPath: gotBed ? bedDest : undefined,
      };
      const ffmpegArgs = buildFfmpegArgs(assets, v.bed_volume_db ?? -20, v.ducking_enabled ?? true, outputPath);

      logger.info("VinhetasService.gerarAudio: step 3/5 — ffmpeg", {
        vinhetaId: id, hasIntro: gotIntro, hasOutro: gotOutro, hasBed: gotBed,
      });
      await runFfmpeg(ffmpegArgs);

      // 7. Measure duration
      const durSec = probeDuration(outputPath);
      logger.info("VinhetasService.gerarAudio: step 4/5 — duration measured", { vinhetaId: id, durSec });

      // 8. Upload final mix to storage
      const storageKey = `vinhetas/final/${id}_${ts}_mix.mp3`;
      const url = await storageProvider.upload(outputPath, storageKey);
      logger.info("VinhetasService.gerarAudio: step 5/5 — uploaded", { vinhetaId: id, url, durSec });

      // 9. Persist
      await v.update({ audio_url: url, duracao_sec: durSec });
      return v;
    } finally {
      // Clean up temp voice + downloaded assets (output handled by storageProvider)
      for (const f of tmpFiles) {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
      }
    }
  }

  // --- Anti-repetição pick ---

  /**
   * Pick a vinheta for playback — respects anti-repetição (last N executions).
   * Only returns vinhetas that already have audio_url set.
   * Channel-specific vinhetas take precedence over global (channel_id IS NULL).
   */
  async pickVinheta(channelId: number, bloco: string, tipoVinheta: string): Promise<Vinheta | null> {
    const candidates = await Vinheta.findAll({
      where: {
        bloco,
        tipo_vinheta: tipoVinheta,
        ativo: true,
        audio_url: { [Op.not]: null },
        [Op.or]: [{ channel_id: channelId }, { channel_id: null }],
      },
      order: [["channel_id", "DESC"], ["prioridade", "DESC"], ["id", "ASC"]],
    });
    if (!candidates.length) return null;

    const recentIds = await VinhetaExecucao.findAll({
      where: { channel_id: channelId },
      order: [["executada_em", "DESC"]],
      limit: ANTI_REPEAT_N,
      attributes: ["vinheta_id"],
    });
    const recentSet = new Set(recentIds.map((e) => e.vinheta_id));

    const pool = candidates.filter((c) => !recentSet.has(c.id));
    const finalPool = pool.length > 0 ? pool : candidates;
    const picked = finalPool[Math.floor(Math.random() * finalPool.length)]!;

    await VinhetaExecucao.create({ vinheta_id: picked.id, channel_id: channelId });
    return picked;
  }

  // --- Seed ---

  async seed(channelId?: number): Promise<{ created: number; skipped: number; total: number }> {
    // Pre-compute which SFX types already have audio stored
    const sfxMap: Partial<Record<TipoVinheta, string | null>> = {};
    for (const tipo of TIPOS_VINHETA) {
      sfxMap[tipo] = await vinhetasSfxService.getStoredUrl(tipo);
    }

    let created = 0;
    let skipped = 0;
    for (const item of SEED_DATA) {
      const existing = await Vinheta.findOne({
        where: { bloco: item.bloco, tipo_vinheta: item.tipo_vinheta, channel_id: channelId ?? null },
      });
      if (existing) { skipped++; continue; }

      // Match background track by bloco tag (e.g. tag "manha" → morning bed)
      const track = await BackgroundTrack.findOne({
        where: { tags: { [Op.contains]: [item.bloco] } },
        order: [["createdAt", "ASC"]],
      });

      await Vinheta.create({
        ...item,
        channel_id: channelId ?? null,
        ativo: true,
        prioridade: 0,
        background_track_id: track?.id ?? null,
        sfx_intro_url: sfxMap[item.tipo_vinheta] ?? null,
        sfx_outro_url: null,
        bed_volume_db: -20,
        ducking_enabled: true,
      } as unknown as Parameters<typeof Vinheta.create>[0]);
      created++;
    }

    logger.info("VinhetasService.seed done", { created, skipped, channelId: channelId ?? "global" });
    return { created, skipped, total: SEED_DATA.length };
  }

  // --- Batch reprocessing ---

  /**
   * Reprocess all active vinhetas (or only those missing audio_url).
   * Runs in the background (fire-and-forget) with max 3 parallel workers.
   * Returns immediately with the count of queued items.
   */
  async regenerarTodas(onlyMissingAudio: boolean): Promise<{ queued: number }> {
    const where = onlyMissingAudio
      ? { ativo: true, audio_url: null }
      : { ativo: true };

    const vinhetas = await Vinheta.findAll({ where });

    logger.info("VinhetasService.regenerarTodas: queued", {
      count: vinhetas.length, onlyMissingAudio,
    });

    // Fire-and-forget with bounded concurrency
    setImmediate(() => {
      void runConcurrent(vinhetas, async (v) => {
        try {
          await this.gerarAudio(v.id);
        } catch (err) {
          logger.warn("regenerarTodas: failed for vinheta", {
            id: v.id, nome: v.nome, err: (err as Error).message,
          });
        }
      }, 3);
    });

    return { queued: vinhetas.length };
  }
}

export const vinhetasService = new VinhetasService();

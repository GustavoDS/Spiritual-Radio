import { Op } from "sequelize";
import { Vinheta, VinhetaExecucao, Voice } from "../../models/index.js";
import { HttpError } from "../../middlewares/errorHandler.js";
import { runSynthesis } from "../../services/VoiceService.js";
import { logger } from "../../lib/logger.js";
import type { BlocoVinheta, TipoVinheta } from "../../models/Vinheta.js";

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
}

const ANTI_REPEAT_N = 3;

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

export class VinhetasService {
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

  async gerarAudio(id: number): Promise<Vinheta> {
    const v = await this.findById(id);

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

    logger.info("VinhetasService.gerarAudio: synthesizing", {
      vinhetaId: v.id,
      voiceId: voice.id,
      textLength: v.texto.length,
    });

    const { url } = await runSynthesis(v.texto, voice);

    // Estimate TTS duration: average ~140 words/min, ~5 chars/word → ~700 chars/min
    const estimatedSec = Math.max(5, Math.ceil(v.texto.length / (700 / 60)));

    await v.update({ audio_url: url, duracao_sec: estimatedSec });

    logger.info("VinhetasService.gerarAudio: done", { vinhetaId: v.id, url, duracao_sec: estimatedSec });
    return v;
  }

  /**
   * Pick a vinheta for playback — respects anti-repetição (last N executions).
   * Only returns vinhetas that already have audio_url set.
   * Channel-specific vinhetas take precedence; falls back to global (channel_id IS NULL).
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

  async seed(channelId?: number): Promise<{ created: number; skipped: number; total: number }> {
    let created = 0;
    let skipped = 0;
    for (const item of SEED_DATA) {
      const existing = await Vinheta.findOne({
        where: { bloco: item.bloco, tipo_vinheta: item.tipo_vinheta, channel_id: channelId ?? null },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await Vinheta.create({
        ...item,
        channel_id: channelId ?? null,
        ativo: true,
        prioridade: 0,
      } as unknown as Parameters<typeof Vinheta.create>[0]);
      created++;
    }
    logger.info("VinhetasService.seed done", { created, skipped, channelId: channelId ?? "global" });
    return { created, skipped, total: SEED_DATA.length };
  }
}

export const vinhetasService = new VinhetasService();

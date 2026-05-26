import { Playlist, PlaylistItem, Content } from "../models/index.js";
import { vinhetasService } from "../modules/vinhetas/vinhetas.service.js";
import { logger } from "../lib/logger.js";
import type { BlocoVinheta, TipoVinheta } from "../models/Vinheta.js";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface QueueItem {
  starts_at: string;        // ISO 8601 UTC
  duration_sec: number;
  tipo: string;
  is_vinheta: boolean;
  // vinheta fields
  vinheta_id?: number;
  // content fields
  content_id?: number;
  audio_url: string | null;
  titulo: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function blocoFromHora(horaStr: string | null | undefined): BlocoVinheta {
  if (!horaStr) return "manha";
  const parts = String(horaStr).split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  if (h < 5)  return "madrugada";
  if (h < 7)  return "amanhecer";
  if (h < 12) return "manha";
  if (h < 14) return "almoco";
  if (h < 18) return "tarde";
  if (h < 21) return "prime";
  if (h < 23) return "noite";
  return "sleep";
}

/** Maps content.tipo → vinheta tipo_vinheta (for "antes_de_X" injection). */
function beforeTipo(contentTipo: string): TipoVinheta | null {
  if (contentTipo === "oracao")                                         return "antes_de_oracao";
  if (["mensagem", "pregacao", "devocional", "reflexao"].includes(contentTipo)) return "antes_de_mensagem";
  if (contentTipo === "versiculo")                                      return "antes_de_versiculo";
  return null; // musica and others → no "antes_de_X"
}

/** Parse "HH:MM:SS" + "YYYY-MM-DD" → Unix epoch ms (UTC). */
function horaToMs(date: string, hora: string): number {
  const p = String(hora).split(":");
  const h = (p[0] ?? "0").padStart(2, "0");
  const m = (p[1] ?? "0").padStart(2, "0");
  const s = ((p[2] ?? "0").split(".")[0] ?? "0").padStart(2, "0");
  return new Date(`${date}T${h}:${m}:${s}Z`).getTime();
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class VinhetaInjectionService {
  /**
   * Build the full day queue for a channel+date, with vinhetas injected.
   * Rules:
   *   1. Bloco transition → encerramento of old bloco + abertura of new bloco.
   *   2. Before oracao/mensagem/versiculo (usa_vinheta_automatica=true) → antes_de_X.
   *   3. Every 3rd consecutive musica → transicao.
   *   4. After last item → encerramento of last bloco.
   */
  async buildQueue(channelId: number, date: string): Promise<{ items: QueueItem[] }> {
    const playlist = await Playlist.findOne({ where: { channel_id: channelId, data: date } });
    if (!playlist) return { items: [] };

    const rows = await PlaylistItem.findAll({
      where: { playlist_id: playlist.id },
      include: [{ model: Content, as: "content" }],
      order: [["hora_execucao", "ASC"], ["ordem", "ASC"]],
    });
    if (!rows.length) return { items: [] };

    // Flatten to a typed structure
    interface RawRow {
      content_id: number;
      titulo: string;
      tipo: string;
      audio_url: string | null;
      duracao_sec: number;
      hora_execucao: string | null;
      usa_vinheta_automatica: boolean;
    }

    const queueRows: RawRow[] = rows.map((item) => {
      const c = (item as unknown as { content: (Content & { usa_vinheta_automatica?: boolean }) | null }).content;
      return {
        content_id: item.content_id ?? 0,
        titulo: c?.titulo ?? "(sem título)",
        tipo: c?.tipo ?? "desconhecido",
        audio_url: c ? (c.mixed_audio_url ?? c.audio_url) : null,
        duracao_sec: c?.duracao ?? 0,
        hora_execucao: item.hora_execucao ? String(item.hora_execucao) : null,
        usa_vinheta_automatica: c?.usa_vinheta_automatica ?? true,
      };
    });

    // Start time: first content item's hora on the given date
    const firstHora = queueRows[0]?.hora_execucao ?? "00:00:00";
    let currentMs = horaToMs(date, firstHora);

    const result: QueueItem[] = [];
    let prevBloco: BlocoVinheta | null = null;
    let musicaCount = 0; // consecutive musicas for transicao trigger

    const injectVinheta = async (bloco: BlocoVinheta, tipo: TipoVinheta): Promise<void> => {
      try {
        const v = await vinhetasService.pickVinheta(channelId, bloco, tipo);
        if (!v || !v.audio_url) return;
        result.push({
          starts_at: new Date(currentMs).toISOString(),
          duration_sec: v.duracao_sec ?? 10,
          tipo: "vinheta",
          is_vinheta: true,
          vinheta_id: v.id,
          audio_url: v.audio_url,
          titulo: v.nome,
        });
        currentMs += (v.duracao_sec ?? 10) * 1000;
      } catch (err) {
        // Never break the queue for a failed vinheta pick
        logger.warn("VinhetaInjection: pickVinheta failed (skipped)", {
          channelId, bloco, tipo, err: (err as Error).message,
        });
      }
    };

    for (let i = 0; i < queueRows.length; i++) {
      const row = queueRows[i]!;
      const bloco = blocoFromHora(row.hora_execucao);
      const isLast = i === queueRows.length - 1;

      // Bloco transition
      if (bloco !== prevBloco) {
        if (prevBloco !== null) {
          await injectVinheta(prevBloco, "encerramento");
        }
        await injectVinheta(bloco, "abertura");
        musicaCount = 0;
        prevBloco = bloco;
      }

      // Antes de X (non-musica content with auto vinheta enabled)
      if (row.usa_vinheta_automatica && row.tipo !== "musica") {
        const tipo = beforeTipo(row.tipo);
        if (tipo) await injectVinheta(bloco, tipo);
      }

      // Content item
      result.push({
        starts_at: new Date(currentMs).toISOString(),
        duration_sec: row.duracao_sec ?? 0,
        tipo: row.tipo,
        is_vinheta: false,
        content_id: row.content_id,
        audio_url: row.audio_url,
        titulo: row.titulo,
      });
      currentMs += (row.duracao_sec ?? 0) * 1000;

      // Musica counter: transicao every 3 consecutive musicas
      if (row.tipo === "musica") {
        musicaCount++;
        if (musicaCount % 3 === 0) {
          await injectVinheta(bloco, "transicao");
        }
      } else {
        musicaCount = 0;
      }

      // Last item → encerramento of final bloco
      if (isLast) {
        await injectVinheta(bloco, "encerramento");
      }
    }

    logger.info("VinhetaInjection: queue built", {
      channelId, date,
      contentItems: queueRows.length,
      totalItems: result.length,
      vinhetasInjected: result.filter((x) => x.is_vinheta).length,
    });

    return { items: result };
  }
}

export const vinhetaInjectionService = new VinhetaInjectionService();

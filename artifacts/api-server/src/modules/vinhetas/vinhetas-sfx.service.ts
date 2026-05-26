import fs from "node:fs";
import path from "node:path";
import { Op } from "sequelize";
import { storageProvider } from "../../storage/index.js";
import { Vinheta } from "../../models/index.js";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import type { TipoVinheta } from "../../models/Vinheta.js";

// ---------------------------------------------------------------------------
// SFX Catalog — one stinger per tipo_vinheta
// ---------------------------------------------------------------------------

export interface SfxEntry {
  intro: string;   // ElevenLabs SFX prompt for the intro stinger
  duration: number; // desired duration in seconds
}

export const SFX_CATALOG: Record<TipoVinheta, SfxEntry> = {
  abertura:           { intro: "Cinematic radio station opener: warm rising synth swell with a soft chime hit at the end, 2 seconds", duration: 2 },
  encerramento:       { intro: "Gentle radio sign-off: descending warm pad with a single soft bell, peaceful, 2 seconds", duration: 2 },
  transicao:          { intro: "Smooth radio transition whoosh, airy and modern, 1 second", duration: 1 },
  antes_de_oracao:    { intro: "Reverent soft chime with subtle reverb, sacred atmosphere, 1.5 seconds", duration: 1.5 },
  antes_de_mensagem:  { intro: "Gentle warm bell with subtle pad swell, contemplative, 1.5 seconds", duration: 1.5 },
  antes_de_versiculo: { intro: "Single delicate harp pluck with light reverb, biblical mood, 1.5 seconds", duration: 1.5 },
};

export interface SfxUrls {
  intro_url: string | null;
  outro_url: string | null;
}

export interface SfxSeedItem extends SfxUrls {
  tipo: string;
}

export interface SfxSeedResult {
  items: SfxSeedItem[];
  created: number;
  skipped: number;
}

export interface SfxStatusItem {
  tipo_vinheta: TipoVinheta;
  audio_url: string | null;
  duracao_sec: number | null;
  prompt: string | null;
  created_at: null; // not persisted in DB — tracked only in storage
  reused_count: number;
}

const TIPOS_ORDER: TipoVinheta[] = [
  "abertura", "encerramento", "transicao",
  "antes_de_oracao", "antes_de_mensagem", "antes_de_versiculo",
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class VinhetasSfxService {
  /** Deterministic storage key for a tipo's intro SFX. */
  private sfxKey(tipo: TipoVinheta): string {
    return `vinhetas/sfx/${tipo}.mp3`;
  }

  /** Public URL of a tipo's SFX if it has already been uploaded; null otherwise. */
  async getStoredUrl(tipo: TipoVinheta): Promise<string | null> {
    try {
      const key = this.sfxKey(tipo);
      if (await storageProvider.exists(key)) {
        return storageProvider.getUrl(key);
      }
    } catch (err) {
      logger.warn("VinhetasSfxService.getStoredUrl: storage error", { tipo, err: (err as Error).message });
    }
    return null;
  }

  /**
   * Generate (or reuse cached) SFX for a given tipo_vinheta.
   * Uses a deterministic storage key so repeated calls are idempotent.
   */
  async generateSfxForType(tipo: TipoVinheta, force = false): Promise<SfxUrls> {
    const key = this.sfxKey(tipo);
    const entry = SFX_CATALOG[tipo];

    if (!force) {
      try {
        if (await storageProvider.exists(key)) {
          const url = storageProvider.getUrl(key);
          logger.info("VinhetasSfxService: SFX cache hit", { tipo, url });
          return { intro_url: url, outro_url: null };
        }
      } catch { /* proceed to generate */ }
    }

    if (!env.elevenLabsApiKey) {
      throw new Error("ELEVENLABS_API_KEY não configurado — defina para gerar SFX");
    }

    logger.info("VinhetasSfxService: generating SFX via ElevenLabs", { tipo, prompt: entry.intro });
    const buf = await this.callElevenLabsSfx(entry.intro, entry.duration);

    // Write to a path under uploadDir (works for both local and R2 providers)
    const sfxDir = path.join(env.uploadDir, "vinhetas", "sfx");
    fs.mkdirSync(sfxDir, { recursive: true });
    const localPath = path.join(sfxDir, `${tipo}.mp3`);
    fs.writeFileSync(localPath, buf);

    const url = await storageProvider.upload(localPath, key);
    logger.info("VinhetasSfxService: SFX uploaded", { tipo, key, url });

    return { intro_url: url, outro_url: null };
  }

  /**
   * Get SFX for a tipo — generate on the fly if not cached.
   * Returns null intro_url if generation fails (avoids breaking gerarAudio pipeline).
   */
  async getOrGenerateSfx(tipo: TipoVinheta): Promise<SfxUrls> {
    try {
      return await this.generateSfxForType(tipo, false);
    } catch (err) {
      logger.warn("VinhetasSfxService.getOrGenerateSfx: failed, skipping SFX", {
        tipo, err: (err as Error).message,
      });
      return { intro_url: null, outro_url: null };
    }
  }

  /**
   * List the status of all 6 SFX types.
   * Always returns 6 items (one per TipoVinheta), with audio_url=null when not yet generated.
   */
  async listSfxStatus(): Promise<SfxStatusItem[]> {
    return Promise.all(
      TIPOS_ORDER.map(async (tipo): Promise<SfxStatusItem> => {
        const key = this.sfxKey(tipo);
        const entry = SFX_CATALOG[tipo];

        let audio_url: string | null = null;
        try {
          if (await storageProvider.exists(key)) {
            audio_url = storageProvider.getUrl(key);
          }
        } catch { /* storage unavailable — treat as not generated */ }

        let reused_count = 0;
        if (audio_url) {
          try {
            reused_count = await Vinheta.count({
              where: {
                [Op.or]: [
                  { sfx_intro_url: audio_url },
                  { sfx_outro_url: audio_url },
                ],
              },
            });
          } catch { /* non-fatal */ }
        }

        return {
          tipo_vinheta: tipo,
          audio_url,
          duracao_sec: audio_url ? entry.duration : null,
          prompt: audio_url ? entry.intro : null,
          created_at: null,
          reused_count,
        };
      }),
    );
  }

  /**
   * Seed all 6 SFX types. Skips existing ones unless force=true.
   */
  async seedAllSfx(force = false): Promise<SfxSeedResult> {
    const items: SfxSeedItem[] = [];
    let created = 0;
    let skipped = 0;

    for (const tipo of Object.keys(SFX_CATALOG) as TipoVinheta[]) {
      try {
        const key = this.sfxKey(tipo);
        const exists = !force && await storageProvider.exists(key).catch(() => false);

        if (exists && !force) {
          const url = storageProvider.getUrl(key);
          items.push({ tipo, intro_url: url, outro_url: null });
          skipped++;
          logger.info("VinhetasSfxService.seed: skipped (exists)", { tipo });
        } else {
          const urls = await this.generateSfxForType(tipo, force);
          items.push({ tipo, ...urls });
          created++;
        }
      } catch (err) {
        logger.error("VinhetasSfxService.seed: failed for tipo", { tipo, err: (err as Error).message });
        items.push({ tipo, intro_url: null, outro_url: null });
      }
    }

    logger.info("VinhetasSfxService.seedAllSfx done", { created, skipped });
    return { items, created, skipped };
  }

  // ---------------------------------------------------------------------------
  // Private — ElevenLabs SFX API call
  // ---------------------------------------------------------------------------

  private async callElevenLabsSfx(prompt: string, durationSeconds: number): Promise<Buffer> {
    const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: {
        "xi-api-key": env.elevenLabsApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: durationSeconds,
        prompt_influence: 0.4,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      throw new Error(`ElevenLabs SFX API ${res.status}: ${body.slice(0, 300)}`);
    }

    return Buffer.from(await res.arrayBuffer());
  }
}

export const vinhetasSfxService = new VinhetasSfxService();

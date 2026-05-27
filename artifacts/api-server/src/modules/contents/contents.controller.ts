import path from "path";
import type { Request, Response } from "express";
import { contentsService } from "./contents.service.js";
import { ok, created, noContent, paginated } from "../../utils/response.js";
import { storageProvider } from "../../storage/index.js";
import { extractAudioDuration } from "../../utils/audio-duration.js";

function buildStorageKey(subdir: "audio" | "images", originalName: string): string {
  const ext = path.extname(originalName) || (subdir === "audio" ? ".mp3" : ".jpg");
  return `${subdir}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
}

async function resolveFileUrl(
  file: Express.Multer.File | undefined,
  subdir: "audio" | "images",
  fallback: unknown,
): Promise<string | undefined> {
  if (file) {
    return storageProvider.upload(file.path, buildStorageKey(subdir, file.originalname));
  }
  return fallback as string | undefined;
}

/**
 * Extract audio duration from a Multer file before it's uploaded to storage.
 * Returns null if the file is not present or extraction fails.
 */
async function extractDurationFromFile(file: Express.Multer.File | undefined): Promise<number | null> {
  if (!file) return null;
  return extractAudioDuration(file.path);
}

export async function getAll(req: Request, res: Response): Promise<void> {
  const result = await contentsService.findAll({
    page: Number(req.query["page"]) || 1,
    limit: Number(req.query["limit"]) || 20,
    categoria_id: req.query["categoria_id"] ? Number(req.query["categoria_id"]) : undefined,
    channel_id: req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined,
    tipo: req.query["tipo"] as string | undefined,
    ativo: req.query["ativo"] !== undefined ? req.query["ativo"] === "true" : undefined,
    search: req.query["search"] as string | undefined,
  });
  paginated(res, result.items, result.total, result.page, result.limit);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const content = await contentsService.findById(Number(req.params["id"]));
  ok(res, content);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const audioFile = files?.["audio"]?.[0];

  // Extract duration from audio while file is still on disk (before storage upload)
  const extractedDuration = await extractDurationFromFile(audioFile);

  const [audio_url, imagem_url] = await Promise.all([
    resolveFileUrl(audioFile, "audio", body["audio_url"]),
    resolveFileUrl(files?.["imagem"]?.[0], "images", body["imagem_url"]),
  ]);

  const dto = {
    titulo: body["titulo"] as string,
    tipo: body["tipo"] as string,
    audio_url,
    imagem_url,
    tags: body["tags"]
      ? (typeof body["tags"] === "string" ? JSON.parse(body["tags"] as string) : body["tags"]) as string[]
      : [],
    categoria_id: body["categoria_id"] ? Number(body["categoria_id"]) : undefined,
    channel_id: body["channel_id"] ? Number(body["channel_id"]) : undefined,
    // Prefer extracted duration from file; fall back to manually supplied value
    duracao: extractedDuration ?? (body["duracao"] ? Number(body["duracao"]) : undefined),
    ativo: body["ativo"] !== undefined ? body["ativo"] === "true" || body["ativo"] === true : true,
  };

  const content = await contentsService.create(dto);
  created(res, content);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const audioFile = files?.["audio"]?.[0];

  // Re-extract duration if a new audio file was uploaded
  const extractedDuration = await extractDurationFromFile(audioFile);

  const [audio_url, imagem_url] = await Promise.all([
    resolveFileUrl(audioFile, "audio", body["audio_url"]),
    resolveFileUrl(files?.["imagem"]?.[0], "images", body["imagem_url"]),
  ]);

  const dto: Record<string, unknown> = { ...body, audio_url, imagem_url };
  if (extractedDuration !== null) dto["duracao"] = extractedDuration;

  const content = await contentsService.update(Number(req.params["id"]), dto);
  ok(res, content, "Conteúdo atualizado");
}

export async function remove(req: Request, res: Response): Promise<void> {
  await contentsService.remove(Number(req.params["id"]));
  noContent(res);
}

export async function bulkAssignChannels(req: Request, res: Response): Promise<void> {
  const body = req.body as { content_ids: number[]; channel_ids: number[]; mode: "add" | "replace" | "remove" };
  if (!Array.isArray(body.content_ids) || !Array.isArray(body.channel_ids)) {
    throw new Error("content_ids e channel_ids devem ser arrays");
  }
  if (!["add", "replace", "remove"].includes(body.mode)) {
    throw new Error("mode deve ser add | replace | remove");
  }
  const result = await contentsService.bulkAssignChannels(body.content_ids, body.channel_ids, body.mode);
  ok(res, result, `bulk-assign-channels (${body.mode}): ${result.updated} conteúdos processados`);
}

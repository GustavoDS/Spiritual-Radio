import type { Request, Response } from "express";
import { contentsService } from "./contents.service.js";
import { ok, created, noContent, paginated } from "../../utils/response.js";
import { filePathToUrl } from "../../utils/fileUrl.js";

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

  const dto = {
    titulo: body["titulo"] as string,
    tipo: body["tipo"] as string,
    audio_url: files?.["audio"]?.[0]?.path
      ? filePathToUrl(files["audio"][0].path)
      : (body["audio_url"] as string | undefined),
    imagem_url: files?.["imagem"]?.[0]?.path
      ? filePathToUrl(files["imagem"][0].path)
      : (body["imagem_url"] as string | undefined),
    tags: body["tags"]
      ? (typeof body["tags"] === "string" ? JSON.parse(body["tags"] as string) : body["tags"]) as string[]
      : [],
    categoria_id: body["categoria_id"] ? Number(body["categoria_id"]) : undefined,
    channel_id: body["channel_id"] ? Number(body["channel_id"]) : undefined,
    duracao: body["duracao"] ? Number(body["duracao"]) : undefined,
    ativo: body["ativo"] !== undefined ? body["ativo"] === "true" || body["ativo"] === true : true,
  };

  const content = await contentsService.create(dto);
  created(res, content);
}

export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;

  const dto = {
    ...body,
    audio_url: files?.["audio"]?.[0]?.path
      ? filePathToUrl(files["audio"][0].path)
      : (body["audio_url"] as string | undefined),
    imagem_url: files?.["imagem"]?.[0]?.path
      ? filePathToUrl(files["imagem"][0].path)
      : (body["imagem_url"] as string | undefined),
  };

  const content = await contentsService.update(Number(req.params["id"]), dto);
  ok(res, content, "Conteúdo atualizado");
}

export async function remove(req: Request, res: Response): Promise<void> {
  await contentsService.remove(Number(req.params["id"]));
  noContent(res);
}

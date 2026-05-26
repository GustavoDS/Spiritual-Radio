import type { Request, Response } from "express";
import { vinhetasService } from "./vinhetas.service.js";
import { ok, created, noContent, paginated } from "../../utils/response.js";
import type { CreateVinhetaInput } from "./vinhetas.service.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  const {
    channel_id, bloco, tipo_vinheta, ativo, page, limit,
  } = req.query as Record<string, string | undefined>;

  const result = await vinhetasService.findAll({
    channel_id: channel_id !== undefined ? Number(channel_id) : undefined,
    bloco,
    tipo_vinheta,
    ativo: ativo !== undefined ? ativo === "true" : undefined,
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  paginated(res, result.items, result.total, result.page, result.limit);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  ok(res, await vinhetasService.findById(id));
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateVinhetaInput;
  created(res, await vinhetasService.create(body));
}

export async function update(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  ok(res, await vinhetasService.update(id, req.body as Partial<CreateVinhetaInput>), "Vinheta atualizada");
}

export async function remove(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  await vinhetasService.remove(id);
  noContent(res);
}

export async function gerarAudio(req: Request, res: Response): Promise<void> {
  const id = Number(req.params["id"]);
  ok(res, await vinhetasService.gerarAudio(id), "Áudio gerado com sucesso");
}

export async function seed(req: Request, res: Response): Promise<void> {
  const channelId = req.body["channel_id"] ? Number(req.body["channel_id"]) : undefined;
  const result = await vinhetasService.seed(channelId);
  ok(res, result, `Seed concluído: ${result.created} criadas, ${result.skipped} já existiam`);
}

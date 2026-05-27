import type { Request, Response } from "express";
import { vinhetasService } from "./vinhetas.service.js";
import { vinhetasSfxService } from "./vinhetas-sfx.service.js";
import { ok, created, noContent, paginated } from "../../utils/response.js";
import type { CreateVinhetaInput } from "./vinhetas.service.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  const { channel_id, bloco, tipo_vinheta, ativo, page, limit } = req.query as Record<string, string | undefined>;
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
  created(res, await vinhetasService.create(req.body as CreateVinhetaInput));
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

export async function getSfxStatus(_req: Request, res: Response): Promise<void> {
  const items = await vinhetasSfxService.listSfxStatus();
  ok(res, { items });
}

export async function sfxSeed(req: Request, res: Response): Promise<void> {
  const force = req.body["force"] === true;
  const result = await vinhetasSfxService.seedAllSfx(force);
  ok(res, result, `SFX seed: ${result.created} gerados, ${result.skipped} reutilizados`);
}

export async function regenerarTodas(req: Request, res: Response): Promise<void> {
  const onlyMissingAudio = req.body["only_missing_audio"] === true;
  const result = await vinhetasService.regenerarTodas(onlyMissingAudio);
  ok(res, result, `Reprocessamento iniciado em background para ${result.queued} vinheta(s)`);
}

export async function bulkAssignChannels(req: Request, res: Response): Promise<void> {
  const body = req.body as { vinheta_ids: number[]; channel_ids: number[]; mode: "add" | "replace" | "remove" };
  if (!Array.isArray(body.vinheta_ids) || !Array.isArray(body.channel_ids)) {
    throw new Error("vinheta_ids e channel_ids devem ser arrays");
  }
  if (!["add", "replace", "remove"].includes(body.mode)) {
    throw new Error("mode deve ser add | replace | remove");
  }
  const result = await vinhetasService.bulkAssignChannels(body.vinheta_ids, body.channel_ids, body.mode);
  ok(res, result, `bulk-assign-channels (${body.mode}): ${result.updated} vinhetas processadas`);
}

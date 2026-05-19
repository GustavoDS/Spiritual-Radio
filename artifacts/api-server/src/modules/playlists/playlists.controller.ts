import type { Request, Response } from "express";
import { playlistsService } from "./playlists.service.js";
import { ok, created, noContent, badRequest, paginated } from "../../utils/response.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  const channelId = req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined;
  const result = await playlistsService.findAll({
    channelId,
    page: Number(req.query["page"]) || 1,
    limit: Number(req.query["limit"]) || 20,
  });
  paginated(res, result.items, result.total, result.page, result.limit);
}

export async function getById(req: Request, res: Response): Promise<void> {
  ok(res, await playlistsService.findById(Number(req.params["id"])));
}

export async function create(req: Request, res: Response): Promise<void> {
  const { channel_id, data } = req.body as { channel_id?: number; data?: string };
  if (!channel_id || !data) {
    badRequest(res, "channel_id e data são obrigatórios");
    return;
  }
  created(res, await playlistsService.create(channel_id, data));
}

export async function update(req: Request, res: Response): Promise<void> {
  ok(res, await playlistsService.update(Number(req.params["id"]), req.body as { channel_id?: number; data?: string }), "Playlist atualizada");
}

export async function remove(req: Request, res: Response): Promise<void> {
  await playlistsService.remove(Number(req.params["id"]));
  noContent(res);
}

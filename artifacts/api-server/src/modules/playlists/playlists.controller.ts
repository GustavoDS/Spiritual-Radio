import type { Request, Response } from "express";
import { playlistsService } from "./playlists.service.js";
import { ok, created, badRequest } from "../../utils/response.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  const channelId = req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined;
  ok(res, await playlistsService.findAll(channelId));
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

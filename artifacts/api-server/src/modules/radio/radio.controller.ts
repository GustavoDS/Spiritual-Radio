import type { Request, Response } from "express";
import { radioService } from "../../services/RadioService.js";
import { ok } from "../../utils/response.js";

export async function getCurrent(req: Request, res: Response): Promise<void> {
  const channelId = req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined;
  ok(res, await radioService.getCurrentContent(channelId));
}

export async function getNext(req: Request, res: Response): Promise<void> {
  const channelId = req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined;
  ok(res, await radioService.getNextContent(channelId));
}

export async function getSchedule(req: Request, res: Response): Promise<void> {
  const channelId = req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined;
  ok(res, await radioService.getDaySchedule(channelId));
}

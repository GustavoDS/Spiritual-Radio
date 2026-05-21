import { Router, type Request, type Response } from "express";
import { getCurrent, getNext, getSchedule } from "../modules/radio/radio.controller.js";
import { getAll as getChannels } from "../modules/channels/channels.controller.js";
import { submitContact, submitPrayerRequest } from "../modules/messages/messages.controller.js";
import { radioService } from "../services/RadioService.js";
import { validateIntegerId } from "../middlewares/validateId.js";
import { validate } from "../middlewares/validate.js";
import { contactLimiter } from "../middlewares/rateLimiter.js";
import { contactSchema, prayerRequestSchema } from "../modules/messages/messages.validators.js";
import { getLiveM3u8, getNowPlaying, ping, getPublicPlaylist } from "../modules/stream/stream.controller.js";

const router = Router();

router.param("id", validateIntegerId);

router.get("/radio/current", getCurrent);
router.get("/radio/next", getNext);
router.get("/radio/schedule", getSchedule);
router.get("/channels", getChannels);

router.post("/contact", contactLimiter, validate(contactSchema), submitContact);
router.post("/prayer-request", contactLimiter, validate(prayerRequestSchema), submitPrayerRequest);

router.get("/stream", async (req: Request, res: Response): Promise<void> => {
  const channelId = req.query["channel_id"] ? Number(req.query["channel_id"]) : undefined;
  const status = await radioService.getCurrentContent(channelId);
  if (!status.current?.audio_url) {
    res.status(404).json({ success: false, message: "Nenhum conteúdo em reprodução no momento" });
    return;
  }
  res.redirect(302, status.current.audio_url);
});

// HLS streaming — path param form: /public/stream/:channelId/...
router.get("/stream/ping", ping);
router.get("/stream/:channelId/live.m3u8", getLiveM3u8);
router.get("/stream/:channelId/now-playing.json", getNowPlaying);
router.get("/stream/:channelId/playlist.json", getPublicPlaylist);

// HLS streaming — query param form (frontend-friendly):
//   GET /public/live.m3u8?channel=<id>
//   GET /public/now-playing.json?channel=<id>
router.get("/live.m3u8", getLiveM3u8);
router.get("/now-playing.json", getNowPlaying);

export default router;

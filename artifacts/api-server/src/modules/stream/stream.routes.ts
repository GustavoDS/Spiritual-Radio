import { Router } from "express";
import { authenticate, requireAdmin } from "../../middlewares/auth.js";
import {
  getAdminStatus,
  getListeners,
  restartChannel,
  reloadChannel,
  getStreamChannels,
} from "./stream.controller.js";

const publicRouter = Router();
const adminRouter = Router();

adminRouter.use(authenticate, requireAdmin);
adminRouter.get("/status", getAdminStatus);
adminRouter.get("/listeners", getListeners);
adminRouter.get("/channels", getStreamChannels);
adminRouter.post("/restart/:channelId", restartChannel);
adminRouter.post("/reload/:channelId", reloadChannel);

export { publicRouter as streamPublicRouter, adminRouter as streamAdminRouter };

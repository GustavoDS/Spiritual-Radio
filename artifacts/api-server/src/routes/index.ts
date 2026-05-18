import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "../modules/auth/auth.routes.js";
import usersRouter from "../modules/users/users.routes.js";
import channelsRouter from "../modules/channels/channels.routes.js";
import contentsRouter from "../modules/contents/contents.routes.js";
import categoriesRouter from "../modules/categories/categories.routes.js";
import schedulesRouter from "../modules/schedules/schedules.routes.js";
import playlistsRouter from "../modules/playlists/playlists.routes.js";
import voicesRouter from "../modules/voices/voices.routes.js";
import radioRouter from "../modules/radio/radio.routes.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/channels", channelsRouter);
router.use("/contents", contentsRouter);
router.use("/categories", categoriesRouter);
router.use("/schedule", schedulesRouter);
router.use("/playlists", playlistsRouter);
router.use("/voices", voicesRouter);
router.use("/radio", radioRouter);

export default router;

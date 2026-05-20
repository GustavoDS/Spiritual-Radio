import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { swaggerSpec } from "./config/swagger.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import { globalLimiter } from "./middlewares/rateLimiter.js";
import { requestIdMiddleware } from "./middlewares/requestId.js";
import { authenticate, requireAdmin } from "./middlewares/auth.js";
import { env } from "./config/env.js";
import { contentProcessingQueue, voiceSynthesisQueue, scheduleQueue, cleanupQueue, automationQueue } from "./queues/index.js";

const app: Express = express();

app.set("trust proxy", 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(requestIdMiddleware);
app.use(globalLimiter);

app.use("/uploads", express.static(env.uploadDir, {
  maxAge: "1d",
  index: false,
  dotfiles: "deny",
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.http(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`, {
      requestId: req.id,
    });
  });
  next();
});

const bullServerAdapter = new ExpressAdapter();
bullServerAdapter.setBasePath("/api/admin/queues");

createBullBoard({
  queues: [
    new BullMQAdapter(contentProcessingQueue),
    new BullMQAdapter(voiceSynthesisQueue),
    new BullMQAdapter(scheduleQueue),
    new BullMQAdapter(cleanupQueue),
    new BullMQAdapter(automationQueue),
  ],
  serverAdapter: bullServerAdapter,
});

app.use("/api/admin/queues", authenticate, requireAdmin, bullServerAdapter.getRouter());

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: "Rádio Espiritual API",
  swaggerOptions: { persistAuthorization: true },
}));

app.get("/api/docs.json", (_req, res) => res.json(swaggerSpec));

app.use("/api", router);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;

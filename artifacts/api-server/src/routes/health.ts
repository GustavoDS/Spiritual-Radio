import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import path from "path";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/download-projeto", (_req, res) => {
  const file = path.resolve("/home/runner/workspace/radio-espiritual-api.zip");
  res.download(file, "radio-espiritual-api.zip");
});

export default router;

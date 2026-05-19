const rawCorsOrigins = process.env["CORS_ORIGINS"] ?? "*";

export const env = {
  nodeEnv: process.env["NODE_ENV"] ?? "development",
  port: Number(process.env["PORT"] ?? 5000),
  databaseUrl: process.env["DATABASE_URL"] ?? "",
  redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6379",
  jwtSecret: process.env["JWT_SECRET"] ?? "changeme-jwt-secret",
  jwtExpiresIn: process.env["JWT_EXPIRES_IN"] ?? "7d",
  logLevel: process.env["LOG_LEVEL"] ?? "info",
  uploadDir: process.env["UPLOAD_DIR"] ?? "uploads",
  maxFileSizeMb: Number(process.env["MAX_FILE_SIZE_MB"] ?? 50),
  corsOrigins: rawCorsOrigins === "*" ? ("*" as const) : rawCorsOrigins.split(",").map((s) => s.trim()),
  rateLimitWindowMs: Number(process.env["RATE_LIMIT_WINDOW_MS"] ?? 60_000),
  rateLimitMax: Number(process.env["RATE_LIMIT_MAX"] ?? 100),
  rateLimitAuthMax: Number(process.env["RATE_LIMIT_AUTH_MAX"] ?? 20),
};

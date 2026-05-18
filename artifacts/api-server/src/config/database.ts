import { Sequelize } from "sequelize";
import { env } from "./env.js";
import { logger } from "../lib/logger.js";

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const sequelize = new Sequelize(env.databaseUrl, {
  dialect: "postgres",
  logging: (sql) => {
    if (env.nodeEnv === "development") {
      logger.debug(sql);
    }
  },
  pool: {
    max: 10,
    min: 2,
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions:
    env.nodeEnv === "production"
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : {},
});

export async function connectDatabase(): Promise<void> {
  await sequelize.authenticate();
  logger.info("Database connection established");
}

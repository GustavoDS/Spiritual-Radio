import fs from "fs";
import path from "path";
import { env } from "../config/env.js";
import { filePathToUrl } from "../utils/fileUrl.js";
import { logger } from "../lib/logger.js";

export class LocalStorageProvider {
  async upload(localPath: string, _key: string): Promise<string> {
    logger.debug("LocalStorageProvider.upload (no-op — file already at path)", { localPath });
    return filePathToUrl(localPath);
  }

  async delete(key: string): Promise<void> {
    const fullPath = key.startsWith("/") ? key : path.join(env.uploadDir, key);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      logger.debug("LocalStorageProvider.delete", { key });
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = key.startsWith("/") ? key : path.join(env.uploadDir, key);
    return fs.existsSync(fullPath);
  }

  getUrl(key: string): string {
    return `/${env.uploadDir}/${key}`;
  }

  async listFiles(subdir: "audio" | "images"): Promise<string[]> {
    const dir = path.join(env.uploadDir, subdir);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).map((f) => path.join(dir, f));
  }
}

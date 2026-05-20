import fs from "fs";
import path from "path";
import { env } from "../config/env.js";
import { filePathToUrl } from "../utils/fileUrl.js";
import { logger } from "../lib/logger.js";
import type { StorageProvider, UploadOptions } from "./index.js";

export class LocalStorageProvider implements StorageProvider {
  async upload(localPath: string, _key: string, _options?: UploadOptions): Promise<string> {
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

  async getSignedUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    return this.getUrl(key);
  }

  async move(fromKey: string, toKey: string): Promise<string> {
    const from = path.join(env.uploadDir, fromKey);
    const to = path.join(env.uploadDir, toKey);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    logger.debug("LocalStorageProvider.move", { fromKey, toKey });
    return this.getUrl(toKey);
  }

  async copy(fromKey: string, toKey: string): Promise<string> {
    const from = path.join(env.uploadDir, fromKey);
    const to = path.join(env.uploadDir, toKey);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    logger.debug("LocalStorageProvider.copy", { fromKey, toKey });
    return this.getUrl(toKey);
  }

  async listFiles(subdir: "audio" | "images"): Promise<string[]> {
    const dir = path.join(env.uploadDir, subdir);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).map((f) => path.join(dir, f));
  }
}

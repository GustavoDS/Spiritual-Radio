import { env } from "../config/env.js";
import { LocalStorageProvider } from "./LocalStorageProvider.js";
import { S3StorageProvider } from "./S3StorageProvider.js";

export interface StorageProvider {
  upload(localPath: string, key: string): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): string;
  listFiles(subdir: "audio" | "images"): Promise<string[]>;
}

function createStorageProvider(): StorageProvider {
  if (env.storageProvider === "s3") {
    if (!env.s3Bucket || !env.s3Region || !env.s3AccessKeyId || !env.s3SecretAccessKey) {
      throw new Error(
        "STORAGE_PROVIDER=s3 requires S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY to be set",
      );
    }
    return new S3StorageProvider();
  }
  return new LocalStorageProvider();
}

export const storageProvider = createStorageProvider();

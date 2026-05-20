import { env } from "../config/env.js";
import { LocalStorageProvider } from "./LocalStorageProvider.js";
import { S3StorageProvider } from "./S3StorageProvider.js";
import { R2StorageProvider } from "./R2StorageProvider.js";

export interface UploadOptions {
  contentType?: string;
}

/**
 * Common interface for all storage providers (local, S3, R2).
 * All methods are async to allow cloud round-trips.
 */
export interface StorageProvider {
  /** Upload a local file and return its public URL. */
  upload(localPath: string, key: string, options?: UploadOptions): Promise<string>;
  /** Delete an object by key. */
  delete(key: string): Promise<void>;
  /** Check whether an object exists. */
  exists(key: string): Promise<boolean>;
  /** Return the public URL for a key without uploading. */
  getUrl(key: string): string;
  /** Return a (possibly time-limited) URL for a key. Falls back to getUrl() for public providers. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  /** Move an object (copy + delete source). Returns the new public URL. */
  move(fromKey: string, toKey: string): Promise<string>;
  /** Copy an object. Returns the new public URL. */
  copy(fromKey: string, toKey: string): Promise<string>;
  /** List stored files in a subdirectory for cleanup purposes. */
  listFiles(subdir: "audio" | "images"): Promise<string[]>;
}

function createStorageProvider(): StorageProvider {
  if (env.storageProvider === "r2") {
    if (!env.r2AccountId || !env.r2AccessKeyId || !env.r2SecretAccessKey || !env.r2Bucket || !env.r2PublicUrl) {
      throw new Error(
        "STORAGE_PROVIDER=r2 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL to be set",
      );
    }
    return new R2StorageProvider();
  }

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

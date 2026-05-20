import {
  S3Client,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import type { StorageProvider, UploadOptions } from "./index.js";

function getMimeType(key: string, provided?: string): string {
  if (provided) return provided;
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    mp4: "audio/mp4",
    m4a: "audio/mp4",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  };
  return map[ext] ?? "application/octet-stream";
}

/**
 * Cloudflare R2 storage provider (S3-compatible API).
 * Requires: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
 */
export class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor() {
    this.bucket = env.r2Bucket;
    this.publicUrl = env.r2PublicUrl.replace(/\/$/, "");

    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
    });
  }

  async upload(localPath: string, key: string, options?: UploadOptions): Promise<string> {
    const fileStream = fs.createReadStream(localPath);
    const contentType = getMimeType(key, options?.contentType);

    const uploader = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: fileStream,
        ContentType: contentType,
      },
    });

    await uploader.done();

    try {
      fs.unlinkSync(localPath);
    } catch {
      logger.warn("R2StorageProvider: failed to delete local temp file after upload", { localPath });
    }

    const url = this.getUrl(key);
    logger.info("R2StorageProvider.upload complete", { key, url, bucket: this.bucket });
    return url;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    logger.debug("R2StorageProvider.delete", { key });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  getUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  async getSignedUrl(key: string, _expiresInSeconds = 3600): Promise<string> {
    // R2 public buckets serve all objects publicly — return public URL.
    // For private buckets, install @aws-sdk/s3-request-presigner and use getSignedUrl().
    return this.getUrl(key);
  }

  async move(fromKey: string, toKey: string): Promise<string> {
    await this.copy(fromKey, toKey);
    await this.delete(fromKey);
    return this.getUrl(toKey);
  }

  async copy(fromKey: string, toKey: string): Promise<string> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${fromKey}`,
        Key: toKey,
      }),
    );
    logger.debug("R2StorageProvider.copy", { fromKey, toKey });
    return this.getUrl(toKey);
  }

  async listFiles(subdir: "audio" | "images"): Promise<string[]> {
    const prefix = `${subdir}/`;
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        }),
      );
      for (const obj of result.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      continuationToken = result.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }
}

import { S3Client, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export class S3StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = env.s3Bucket;
    this.client = new S3Client({
      region: env.s3Region,
      credentials: {
        accessKeyId: env.s3AccessKeyId,
        secretAccessKey: env.s3SecretAccessKey,
      },
    });
  }

  async upload(localPath: string, key: string): Promise<string> {
    const fileStream = fs.createReadStream(localPath);
    const contentType = key.endsWith(".mp3") ? "audio/mpeg" : key.includes("audio") ? "audio/mpeg" : "application/octet-stream";

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: fileStream,
        ContentType: contentType,
      },
    });

    await upload.done();

    try {
      fs.unlinkSync(localPath);
    } catch {
      logger.warn("S3StorageProvider: failed to delete local file after upload", { localPath });
    }

    const url = this.getUrl(key);
    logger.info("S3StorageProvider.upload complete", { key, url });
    return url;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    logger.debug("S3StorageProvider.delete", { key });
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
    if (env.s3Region === "us-east-1") {
      return `https://${this.bucket}.s3.amazonaws.com/${key}`;
    }
    return `https://${this.bucket}.s3.${env.s3Region}.amazonaws.com/${key}`;
  }

  async listFiles(_subdir: "audio" | "images"): Promise<string[]> {
    return [];
  }
}

import multer from "multer";
import path from "path";
import fs from "fs";
import { env } from "../config/env.js";
import { HttpError } from "./errorHandler.js";

function ensureUploadDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(env.uploadDir, "audio");
    ensureUploadDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(env.uploadDir, "images");
    ensureUploadDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

function fileFilter(
  allowedMimeTypes: string[],
): multer.Options["fileFilter"] {
  return (_req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new HttpError(`Tipo de arquivo não permitido: ${file.mimetype}`, 400));
    }
  };
}

const maxSize = env.maxFileSizeMb * 1024 * 1024;

export const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: maxSize },
  fileFilter: fileFilter(["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/mp4"]),
});

export const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter(["image/jpeg", "image/png", "image/webp", "image/gif"]),
});

export const uploadContent = multer({
  storage: multer.diskStorage({
    destination: (_req, file, cb) => {
      const dir = path.join(
        env.uploadDir,
        file.mimetype.startsWith("audio") ? "audio" : "images",
      );
      ensureUploadDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: maxSize },
  fileFilter: fileFilter([
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/mp4",
    "image/jpeg", "image/png", "image/webp",
  ]),
});

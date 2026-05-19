import multer from "multer";
import path from "path";
import fs from "fs";
import type { Request, Response, NextFunction } from "express";
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

const AUDIO_MIMES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/mp4"];
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const AUDIO_MAGIC: Record<string, string[]> = {
  "audio/mpeg": ["ff fb", "ff f3", "ff f2", "49 44 33"],
  "audio/mp3": ["ff fb", "ff f3", "ff f2", "49 44 33"],
  "audio/wav": ["52 49 46 46"],
  "audio/ogg": ["4f 67 67 53"],
  "audio/mp4": ["00 00 00"],
};

const IMAGE_MAGIC: Record<string, string[]> = {
  "image/jpeg": ["ff d8 ff"],
  "image/png": ["89 50 4e 47"],
  "image/webp": ["52 49 46 46"],
  "image/gif": ["47 49 46 38"],
};

const ALL_MAGIC = { ...AUDIO_MAGIC, ...IMAGE_MAGIC };

function readMagicBytes(filePath: string, length = 12): string {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(length);
  fs.readSync(fd, buf, 0, length, 0);
  fs.closeSync(fd);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

function isMagicValid(filePath: string, mimetype: string): boolean {
  const patterns = ALL_MAGIC[mimetype];
  if (!patterns) return true;
  try {
    const magic = readMagicBytes(filePath);
    return patterns.some((p) => magic.startsWith(p));
  } catch {
    return false;
  }
}

function fileFilter(allowedMimeTypes: string[]): multer.Options["fileFilter"] {
  return (_req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new HttpError(`Tipo de arquivo não permitido: ${file.mimetype}`, 400));
    }
  };
}

export async function validateMagicBytes(req: Request, res: Response, next: NextFunction): Promise<void> {
  const allFiles: Express.Multer.File[] = [];

  if (req.file) allFiles.push(req.file);
  if (req.files) {
    if (Array.isArray(req.files)) {
      allFiles.push(...req.files);
    } else {
      for (const arr of Object.values(req.files)) allFiles.push(...arr);
    }
  }

  for (const file of allFiles) {
    if (!isMagicValid(file.path, file.mimetype)) {
      fs.unlinkSync(file.path);
      next(new HttpError(`Arquivo inválido: conteúdo não corresponde ao tipo declarado (${file.mimetype})`, 400));
      return;
    }
  }

  next();
}

const maxSize = env.maxFileSizeMb * 1024 * 1024;

export const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: maxSize },
  fileFilter: fileFilter(AUDIO_MIMES),
});

export const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter(IMAGE_MIMES),
});

export const uploadContent = multer({
  storage: multer.diskStorage({
    destination: (_req, file, cb) => {
      const dir = path.join(env.uploadDir, file.mimetype.startsWith("audio") ? "audio" : "images");
      ensureUploadDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: maxSize },
  fileFilter: fileFilter([...AUDIO_MIMES, ...IMAGE_MIMES]),
});

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";

/** Where uploaded files' bytes actually live — gitignored, created on first use. */
export const uploadsDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

/**
 * Multer disk storage, keyed by a random name so concurrent uploads of same-named
 * files never collide — the original filename is kept separately (Card.title /
 * metadata.file.originalName), not used as the on-disk name.
 */
export const fileUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

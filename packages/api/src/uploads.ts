import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import type { Request, Response } from "express";

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

/** The bit of a multer `req.file` every "file"-typed Card creation path actually
 *  needs (cardService.createFileCard/pageCardService.addFileCardToPage/
 *  dockCardService.addFileCardToDock) — factored out here, the module that already
 *  knows the shape of a multer upload, rather than each service redeclaring it. */
export interface UploadedFile {
  storedName: string;
  originalName: string;
  mimeType: string;
  size: number;
}

/** The `if (!req.file) return 400` + field-mapping every `fileUpload.single("file")`
 *  route handler repeated identically (cards.ts, pages.ts, dockCards.ts) — sends the
 *  400 itself and returns `undefined` on failure, so a call site's whole body is
 *  just `const file = requireUploadedFile(req, res); if (!file) return;`. */
export function requireUploadedFile(req: Request, res: Response): UploadedFile | undefined {
  if (!req.file) {
    res.status(400).json({ error: "file is required" });
    return undefined;
  }
  return {
    storedName: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  };
}

import path from "node:path";
import { Router } from "express";
import { fileUpload, uploadsDir } from "../uploads.js";

export const richTextImagesRouter = Router();

/** POST /api/rich-text-images — uploads a single image for inline use inside a
 *  Card's rich text (a TipTap `image` node — see mathNode.ts's sibling
 *  richText/extensions.ts's imageExtension), not a "file" Card: no Card/PageCard/
 *  DockCard row is created, just the bytes on disk (same uploads dir/multer config
 *  "file" Cards use) plus a URL to reference from an `<img src>`. */
richTextImagesRouter.post("/", fileUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.status(201).json({ url: `/api/rich-text-images/${req.file.filename}` });
});

/** GET /api/rich-text-images/:filename — streams the bytes back. Content-Type is
 *  inferred from the extension by `res.sendFile` (the uploaded filename keeps its
 *  original extension — see uploads.ts), not stored separately anywhere.
 *  `path.basename` strips any directory components from the param before it ever
 *  reaches `path.join` — without it, a `filename` like `../../.env` would resolve
 *  outside `uploadsDir` (path traversal). */
richTextImagesRouter.get("/:filename", (req, res) => {
  const filePath = path.join(uploadsDir, path.basename(req.params.filename));
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "File not found" });
  });
});

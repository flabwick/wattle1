import path from "node:path";
import { Router } from "express";
import type { Card } from "@wattle/shared";
import * as cardService from "../services/cardService.js";
import { runOperation } from "../operations/run.js";
import { uploadsDir } from "../uploads.js";

export const cardsRouter = Router();

// GET /api/cards?q=search+term — vault list + search (title/text match).
cardsRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  res.json(await cardService.listCards(q));
});

cardsRouter.get("/:id", async (req, res) => {
  const card = await cardService.getCard(req.params.id);
  if (!card) return res.status(404).json({ error: "Card not found" });
  res.json(card);
});

// GET /api/cards/:id/file — streams a "file"-typed Card's uploaded bytes back to the
// browser (PDF viewer iframe, markdown-source fetch, etc.) — see metadata.file.
cardsRouter.get("/:id/file", async (req, res) => {
  const card = await cardService.getCard(req.params.id);
  const file = card?.metadata.file;
  if (!file) return res.status(404).json({ error: "Card has no uploaded file" });

  const filePath = path.join(uploadsDir, file.storedName);
  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.originalName)}"`);
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "File not found" });
  });
});

cardsRouter.post("/", async (req, res) => {
  const { title, content, folderId } = req.body ?? {};
  if (typeof title !== "string" || typeof content !== "string") {
    return res.status(400).json({ error: "title and content are required strings" });
  }
  res.status(201).json(
    await cardService.createCard({
      title,
      content,
      folderId: typeof folderId === "string" ? folderId : null,
    }),
  );
});

// Direct vault edit — wraps the "card.rename" Operation. Distinct from the "card.edit"
// Operation used by PATCH /api/page-cards/:id, which edits an in-page draft instead.
cardsRouter.patch("/:id", async (req, res) => {
  const payload = { ...(req.body ?? {}), id: req.params.id };
  res.json(await runOperation<Card>("card.rename", payload));
});

cardsRouter.delete("/:id", async (req, res) => {
  await runOperation<void>("card.delete", { id: req.params.id });
  res.status(204).end();
});

// PATCH /api/cards/:id/move  { folderId: string | null } — move a vault Card into a
// different Folder (null = vault root). Wraps the "card.move" Operation.
cardsRouter.patch("/:id/move", async (req, res) => {
  const payload = { id: req.params.id, folderId: req.body?.folderId ?? null };
  res.json(await runOperation<Card>("card.move", payload));
});

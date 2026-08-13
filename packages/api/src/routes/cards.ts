import path from "node:path";
import { Router } from "express";
import type { Card } from "@wattle/shared";
import { isEpubFile, isHtmlFile } from "@wattle/shared";
import * as cardService from "../services/cardService.js";
import { runOperation } from "../operations/run.js";
import { fileUpload, requireUploadedFile, uploadsDir } from "../uploads.js";
import { divideEpubIntoSections, divideHtmlIntoSections } from "../services/htmlEpubService.js";

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
  const { title, content } = req.body ?? {};
  if (typeof title !== "string" || typeof content !== "string") {
    return res.status(400).json({ error: "title and content are required strings" });
  }
  res.status(201).json(await cardService.createCard({ title, content }));
});

// POST /api/cards/files  multipart/form-data, field "file" — the Vault panel's own
// Upload action (see cardService.createFileCard), as opposed to
// POST /api/pages/:pageId/files (page-local) or POST /api/dock-cards/files
// (Dock-local).
cardsRouter.post("/files", fileUpload.single("file"), async (req, res) => {
  const file = requireUploadedFile(req, res);
  if (!file) return;
  res.status(201).json(await cardService.createFileCard(file));
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

// POST /api/cards/:id/freeze — read-only from here on (Wattle vault plan's
// Open/Frozen). Wraps the "card.freeze" Operation.
cardsRouter.post("/:id/freeze", async (req, res) => {
  res.json(await runOperation<Card>("card.freeze", { cardId: req.params.id }));
});

// POST /api/cards/:id/extract-text  { method?, instructions? } — wraps the
// "file.extractText" Operation. Synchronous and potentially slow (a vision-model
// round trip per page, see fileExtractionService.ts); FileView.tsx shows a loading
// state for the duration.
cardsRouter.post("/:id/extract-text", async (req, res) => {
  res.json(await runOperation<Card>("file.extractText", { ...(req.body ?? {}), cardId: req.params.id }));
});

// POST /api/cards/:id/divide — the "division" Convert path (Dock.tsx's "Split into
// Cards"): EPUB -> one section per spine chapter, HTML -> one section per <h1>. A
// plain route+service, not an Operation — this never mutates the Card itself (see
// registries/README.md's "not every mutation needs to be an Operation"), it's a
// stateless read: the client turns the response into N new Cards on its own via
// the ordinary addNewCardToPage/createCardInDock calls, same as any other
// multi-Card creation.
cardsRouter.post("/:id/divide", async (req, res) => {
  const card = await cardService.getCard(req.params.id);
  if (!card) return res.status(404).json({ error: "Card not found" });
  const file = card.metadata.file;
  if (!file) return res.status(400).json({ error: "Card has no uploaded file" });

  const filePath = path.join(uploadsDir, file.storedName);
  if (isEpubFile(file.originalName, file.mimeType)) {
    return res.json({ sections: await divideEpubIntoSections(filePath) });
  }
  if (isHtmlFile(file.originalName, file.mimeType)) {
    return res.json({ sections: await divideHtmlIntoSections(filePath, card.title || file.originalName) });
  }
  res.status(400).json({ error: "Division only supports EPUB and HTML files." });
});

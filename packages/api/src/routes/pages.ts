import { Router } from "express";
import * as pageService from "../services/pageService.js";
import * as pageCardService from "../services/pageCardService.js";
import * as pageLinkService from "../services/pageLinkService.js";
import { runOperation } from "../operations/run.js";
import { fileUpload } from "../uploads.js";

export const pagesRouter = Router();

// GET /api/pages?q=... — search/list Pages by title (Search's Page results, and the
// Pages panel's own quick-jump list). Omit `q` for the default "claimed" listing —
// see pageService.searchPages's doc comment.
pagesRouter.get("/", async (req, res) => {
  const { q } = req.query;
  res.json(await pageService.searchPages(typeof q === "string" ? q : undefined));
});

// GET /api/pages/pinned — the scarce pin rail (Phase 4).
pagesRouter.get("/pinned", async (_req, res) => {
  res.json(await pageService.listPinnedPages());
});

// POST /api/pages/resolve  { title } — find-or-create by title, for the Page-link
// picker's "link to missing title → create empty Page, link to it" (Phase 2).
pagesRouter.post("/resolve", async (req, res) => {
  const { title } = req.body ?? {};
  if (typeof title !== "string") {
    return res.status(400).json({ error: "title is required" });
  }
  res.status(200).json(await pageLinkService.resolveOrCreatePageByTitle(title));
});

pagesRouter.post("/", async (req, res) => {
  const { title } = req.body ?? {};
  res.status(201).json(await pageService.createPage(typeof title === "string" ? title : undefined));
});

// GET /api/pages/:id — the page-centric fetch (with its Cards) every Page view uses.
pagesRouter.get("/:id", async (req, res) => {
  const page = await pageService.getPage(req.params.id);
  if (!page) return res.status(404).json({ error: "Page not found" });
  res.json(page);
});

// GET /api/pages/:id/siblings — former Tab-stack (or explicit trail) neighbors, for
// the optional next/prev polish (Phase 3) — empty array if this Page has no group.
pagesRouter.get("/:id/siblings", async (req, res) => {
  res.json(await pageService.listSiblingPages(req.params.id));
});

pagesRouter.patch("/:id", async (req, res) => {
  const { title } = req.body ?? {};
  if (typeof title !== "string") {
    return res.status(400).json({ error: "title is required" });
  }
  res.json(await pageService.renamePage(req.params.id, title));
});

// PUT /api/pages/:id/pin  { pinnedOrder: number | null }
pagesRouter.put("/:id/pin", async (req, res) => {
  const { pinnedOrder } = req.body ?? {};
  if (pinnedOrder !== null && typeof pinnedOrder !== "number") {
    return res.status(400).json({ error: "pinnedOrder must be a number or null" });
  }
  res.json(await pageService.setPinned(req.params.id, pinnedOrder));
});

pagesRouter.delete("/:id", async (req, res) => {
  await pageService.deletePage(req.params.id);
  res.status(204).end();
});

// PUT /api/pages/reorder-siblings  { orderedIds: string[] }  (bottom-to-top, within
// one siblingGroupId).
pagesRouter.put("/reorder-siblings", async (req, res) => {
  const { orderedIds } = req.body ?? {};
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: "orderedIds must be an array of Page ids" });
  }
  await pageService.reorderSiblingPages(orderedIds);
  res.status(204).end();
});

// POST /api/pages/:pageId/cards  { cardId } | { title, content, metadata? } — open
// existing vs. create new. `metadata`, if present, is raw/unvalidated (see
// pageCardService.addNewCardToPage) — omit for a plain "note".
pagesRouter.post("/:pageId/cards", async (req, res) => {
  const { pageId } = req.params;
  const { cardId, title, content, metadata } = req.body ?? {};

  if (typeof cardId === "string") {
    return res.status(201).json(await pageCardService.addExistingCardToPage(pageId, cardId));
  }
  if (typeof title === "string" && typeof content === "string") {
    return res.status(201).json(await pageCardService.addNewCardToPage(pageId, title, content, metadata));
  }
  res.status(400).json({ error: "Provide either { cardId } or { title, content }" });
});

// POST /api/pages/:pageId/files  multipart/form-data, field "file" — upload a file and
// attach it to the Page as a new "file"-typed Card (see pageCardService.addFileCardToPage).
pagesRouter.post("/:pageId/files", fileUpload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "file is required" });
  }
  const pageCard = await pageCardService.addFileCardToPage(req.params.pageId, {
    storedName: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
  });
  res.status(201).json(pageCard);
});

// PUT /api/pages/:pageId/cards/reorder  { orderedIds: string[] }  (top-to-bottom as
// displayed). Wraps the "card.reorder" Operation.
pagesRouter.put("/:pageId/cards/reorder", async (req, res) => {
  const { pageId } = req.params;
  await runOperation<void>("card.reorder", { pageId, orderedIds: req.body?.orderedIds });
  res.status(204).end();
});

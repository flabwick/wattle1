import { Router } from "express";
import * as pageService from "../services/pageService.js";
import * as pageCardService from "../services/pageCardService.js";
import { runOperation } from "../operations/run.js";
import { fileUpload } from "../uploads.js";

export const pagesRouter = Router();

// GET /api/pages?tabId=X — the full stack for that Tab, bottom to top, each with its Cards.
pagesRouter.get("/", async (req, res) => {
  const { tabId } = req.query;
  if (typeof tabId !== "string") {
    return res.status(400).json({ error: "tabId is required" });
  }
  res.json(await pageService.listPages(tabId));
});

pagesRouter.post("/", async (req, res) => {
  const { tabId, order } = req.body ?? {};
  if (typeof tabId !== "string") {
    return res.status(400).json({ error: "tabId is required" });
  }
  res.status(201).json(await pageService.createPage(tabId, typeof order === "number" ? order : undefined));
});

pagesRouter.delete("/:id", async (req, res) => {
  await pageService.deletePage(req.params.id);
  res.status(204).end();
});

// PUT /api/pages/reorder  { orderedIds: string[] }  (bottom-to-top)
pagesRouter.put("/reorder", async (req, res) => {
  const { orderedIds } = req.body ?? {};
  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: "orderedIds must be an array of Page ids" });
  }
  await pageService.reorderPages(orderedIds);
  res.status(204).end();
});

// POST /api/pages/:pageId/cards  { cardId } | { title, content } — open existing vs. create new.
pagesRouter.post("/:pageId/cards", async (req, res) => {
  const { pageId } = req.params;
  const { cardId, title, content } = req.body ?? {};

  if (typeof cardId === "string") {
    return res.status(201).json(await pageCardService.addExistingCardToPage(pageId, cardId));
  }
  if (typeof title === "string" && typeof content === "string") {
    return res.status(201).json(await pageCardService.addNewCardToPage(pageId, title, content));
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

import { Router } from "express";
import type { DockCardWithCard } from "@wattle/shared";
import * as dockCardService from "../services/dockCardService.js";
import { runOperation } from "../operations/run.js";
import { fileUpload, requireUploadedFile } from "../uploads.js";

// Mounted at /api/dock-cards — the persistent Dock scratchpad layer (Step 6 spec
// §1.2), outside any Page/Tab.
export const dockCardsRouter = Router();

// GET /api/dock-cards — every Dock Card, in scroll-row order.
dockCardsRouter.get("/", async (_req, res) => {
  res.json(await dockCardService.listDockCards());
});

// POST /api/dock-cards  { cardId } | { title, content } — open existing vs. create new,
// same shape as POST /api/pages/:pageId/cards.
dockCardsRouter.post("/", async (req, res) => {
  const { cardId, title, content } = req.body ?? {};

  if (typeof cardId === "string") {
    return res.status(201).json(await dockCardService.addExistingCardToDock(cardId));
  }
  if (typeof title === "string" && typeof content === "string") {
    return res.status(201).json(await dockCardService.createCardInDock(title, content));
  }
  res.status(400).json({ error: "Provide either { cardId } or { title, content }" });
});

// POST /api/dock-cards/files  multipart/form-data, field "file".
dockCardsRouter.post("/files", fileUpload.single("file"), async (req, res) => {
  const file = requireUploadedFile(req, res);
  if (!file) return;
  res.status(201).json(await dockCardService.addFileCardToDock(file));
});

// DELETE /api/dock-cards/:id — "Close": unpins from the Dock if the Card is saved to
// the vault (vault Card untouched), otherwise deletes the Card outright.
dockCardsRouter.delete("/:id", async (req, res) => {
  await dockCardService.removeDockCard(req.params.id);
  res.status(204).end();
});

// POST /api/dock-cards/:id/fork — forks the Frozen Card this DockCard points at and
// repoints it at the fork. Wraps the "card.forkOccurrence" Operation.
dockCardsRouter.post("/:id/fork", async (req, res) => {
  res.json(
    await runOperation<DockCardWithCard>("card.forkOccurrence", { location: "dock", dockCardId: req.params.id }),
  );
});

// PUT /api/dock-cards/:id/move-to-page  { pageId, destIndex }
dockCardsRouter.put("/:id/move-to-page", async (req, res) => {
  const { pageId, destIndex } = req.body ?? {};
  if (typeof pageId !== "string" || typeof destIndex !== "number") {
    return res.status(400).json({ error: "pageId and destIndex are required" });
  }
  res.json(await dockCardService.moveDockCardToPage(req.params.id, pageId, destIndex));
});

// POST /api/dock-cards/:id/convert-to-stack — the Dock Card header's own "+"
// (CardHeaderActions' onTurnIntoStack), the Dock's counterpart to POST
// /api/stacks/convert for a Page Card.
dockCardsRouter.post("/:id/convert-to-stack", async (req, res) => {
  res.status(201).json(await dockCardService.convertDockCardToStack(req.params.id));
});

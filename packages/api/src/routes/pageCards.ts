import { Router } from "express";
import type { PageCard } from "@wattle/shared";
import * as pageCardService from "../services/pageCardService.js";
import * as dockCardService from "../services/dockCardService.js";
import { runOperation } from "../operations/run.js";

// Mounted at /api/page-cards — operations on a single Card-within-a-Page (the Dock's
// edit/save/remove/delete actions from spec1.md Part 3 "The Dock").
export const pageCardsRouter = Router();

// PATCH /api/page-cards/:id  { title?, content? } — inline edit, stored as a draft
// until explicitly saved back to the vault. Wraps the "card.edit" Operation.
pageCardsRouter.patch("/:id", async (req, res) => {
  const payload = { ...(req.body ?? {}), id: req.params.id };
  res.json(await runOperation<PageCard>("card.edit", payload));
});

// POST /api/page-cards/:id/save — persist draft edits to the vault Card. Wraps the
// "card.save" Operation.
pageCardsRouter.post("/:id/save", async (req, res) => {
  res.json(await runOperation<PageCard>("card.save", { id: req.params.id }));
});

// POST /api/page-cards/:id/fork — forks the Frozen Card this occurrence points at and
// repoints this occurrence at the fork. Wraps the "card.forkOccurrence" Operation.
pageCardsRouter.post("/:id/fork", async (req, res) => {
  res.json(await runOperation<PageCard>("card.forkOccurrence", { location: "page", pageCardId: req.params.id }));
});

// DELETE /api/page-cards/:id — remove from this Page only; vault Card is untouched.
pageCardsRouter.delete("/:id", async (req, res) => {
  await pageCardService.removeFromPage(req.params.id);
  res.status(204).end();
});

// DELETE /api/page-cards/:id/vault — remove from the Page and delete the vault Card entirely.
pageCardsRouter.delete("/:id/vault", async (req, res) => {
  await pageCardService.deleteEntirely(req.params.id);
  res.status(204).end();
});

// PUT /api/page-cards/:id/move  { destPageId, destIndex } — Move Mode's drop action.
// Ad hoc, not an Operation-registry action (same reasoning as remove/delete-from-page
// above): Move is a structural placement change that should work for every CardType.
pageCardsRouter.put("/:id/move", async (req, res) => {
  const { destPageId, destIndex } = req.body ?? {};
  await pageCardService.movePageCard(req.params.id, destPageId, destIndex);
  res.status(204).end();
});

// PUT /api/page-cards/:id/move-to-dock — moves this Card off its Page and onto the
// Dock's persistent scratchpad (Step 6 spec §4.2's simple one-off "Move to Dock").
pageCardsRouter.put("/:id/move-to-dock", async (req, res) => {
  res.json(await dockCardService.movePageCardToDock(req.params.id));
});

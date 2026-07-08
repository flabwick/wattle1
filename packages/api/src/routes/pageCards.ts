import { Router } from "express";
import * as pageCardService from "../services/pageCardService.js";

// Mounted at /api/page-cards — operations on a single Card-within-a-Page (the Dock's
// edit/save/remove/delete actions from spec1.md Part 3 "The Dock").
export const pageCardsRouter = Router();

// PATCH /api/page-cards/:id  { title?, content? } — inline edit, stored as a draft
// until explicitly saved back to the vault.
pageCardsRouter.patch("/:id", async (req, res) => {
  const { title, content } = req.body ?? {};
  res.json(await pageCardService.updateDraft(req.params.id, { title, content }));
});

// POST /api/page-cards/:id/save — persist draft edits to the vault Card.
pageCardsRouter.post("/:id/save", async (req, res) => {
  res.json(await pageCardService.saveToVault(req.params.id));
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

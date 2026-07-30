import { Router } from "express";
import * as annotationService from "../services/annotationService.js";

// Mounted at /api/annotations — the diff/footnote/highlight processes' endpoints.
// Plain service-backed routes, not Operation-registry entries: same precedent as
// pageCards.ts's Move/remove-from-page (registries/README.md) — these are structural
// actions on Card content, not behavior gated per-CardType.
export const annotationsRouter = Router();

// POST /api/annotations/run  { process, cardId, selection?: { cardId, text },
// pageCardId?, instruction? } — the sole model invocation for a diff/footnote/highlight
// run, whole-card (root + nested) or scoped to a text selection. `pageCardId`, if the
// target Card is currently open on a Page, resolves its *effective* (draft-aware)
// content — see annotationService.ts's resolveDraftTarget doc comment: a not-yet-saved
// Card's real content can be empty/stale while the PageCard's own draftContent is what
// the user is actually looking at. `instruction`, only meaningful for process "diff",
// drives the Dock's magic-button rewrite-in-place flow instead of its default narrow
// proofread-only behavior. Returns every Card that received a new annotation.
annotationsRouter.post("/run", async (req, res) => {
  const { process, cardId, selection, pageCardId, instruction } = req.body ?? {};
  const cards = await annotationService.runAnnotationProcess(process, cardId, selection, pageCardId, instruction);
  res.json({ cards });
});

// POST /api/annotations/highlight  { cardId, anchor, color, text?, pageCardId? } —
// manually-triggered highlight (text-selection context menu), no model call.
annotationsRouter.post("/highlight", async (req, res) => {
  const { cardId, anchor, color, text, pageCardId } = req.body ?? {};
  const card = await annotationService.createManualHighlight(cardId, anchor, color, text, pageCardId);
  res.status(201).json(card);
});

// POST /api/annotations/:cardId/:annotationId/accept  { pageCardId? } — accepts one
// pending diff.
annotationsRouter.post("/:cardId/:annotationId/accept", async (req, res) => {
  const { pageCardId } = req.body ?? {};
  const card = await annotationService.acceptDiff(req.params.cardId, req.params.annotationId, pageCardId);
  res.json(card);
});

// POST /api/annotations/:cardId/accept-all  { pageCardId? } — accepts every pending
// diff on a Card.
annotationsRouter.post("/:cardId/accept-all", async (req, res) => {
  const { pageCardId } = req.body ?? {};
  const card = await annotationService.acceptAllDiffs(req.params.cardId, pageCardId);
  res.json(card);
});

// DELETE /api/annotations/:cardId/:annotationId — rejects a pending diff, or removes a
// footnote/highlight entirely. Permanent either way; no separate reject state.
annotationsRouter.delete("/:cardId/:annotationId", async (req, res) => {
  const card = await annotationService.removeAnnotation(req.params.cardId, req.params.annotationId);
  res.json(card);
});

// PATCH /api/annotations/:cardId/:annotationId  { text } — edits a footnote's or
// highlight's user-editable text.
annotationsRouter.patch("/:cardId/:annotationId", async (req, res) => {
  const { text } = req.body ?? {};
  const card = await annotationService.updateAnnotationText(req.params.cardId, req.params.annotationId, text);
  res.json(card);
});

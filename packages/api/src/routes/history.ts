import { Router } from "express";
import type { HistoryEntry, HistoryScope } from "@wattle/shared";
import * as historyService from "../services/historyService.js";

// Mounted at /api/history — the full state system's log: Undo/Redo ("edit" entries)
// and Back/Forward ("generation" entries), page-wide or scoped to a card selection.
// See historyService.ts for the scope-filtering/restore logic; this file is a thin
// wrapper, same style as pageCards.ts's own ad hoc (non-Operation-registry) routes.
export const historyRouter = Router();

function readScope(body: unknown): HistoryScope {
  const scope = (body as { scope?: unknown } | undefined)?.scope;
  return Array.isArray(scope) ? (scope as string[]) : "page";
}

// GET /api/history/:pageId — full chronological log, for the client's historyStore
// to hydrate from once per Page load.
historyRouter.get("/:pageId", async (req, res) => {
  res.json(await historyService.listEntries(req.params.pageId));
});

// POST /api/history/:pageId/record  { kind, label, cardIds, before, after } — records
// one entry. Called by the frontend right after a mutation it already made succeeds
// (see App.tsx's withHistory/useEditHistoryRecorder), not by any mutation route
// itself — the frontend is what knows exactly what changed and already holds the
// pre/post state in memory.
historyRouter.post("/:pageId/record", async (req, res) => {
  const { kind, label, cardIds, before, after } = req.body ?? {};
  const entry: HistoryEntry = await historyService.recordEntry(
    req.params.pageId,
    kind === "generation" ? "generation" : "edit",
    String(label ?? ""),
    Array.isArray(cardIds) ? cardIds : [],
    Array.isArray(before) ? before : [],
    Array.isArray(after) ? after : [],
  );
  res.json(entry);
});

// POST /api/history/:pageId/undo | /redo | /back | /forward  { scope } — scope is
// "page" (default/omitted) or an array of Card ids for a selection-scoped step.
// Responds the entry that was applied (or null if nothing to do) — the frontend
// reloads the Page itself via usePage's existing refresh(), so this doesn't need to
// re-serialize a PageWithCards.
historyRouter.post("/:pageId/undo", async (req, res) => {
  res.json(await historyService.undo(req.params.pageId, readScope(req.body)));
});

historyRouter.post("/:pageId/redo", async (req, res) => {
  res.json(await historyService.redo(req.params.pageId, readScope(req.body)));
});

historyRouter.post("/:pageId/back", async (req, res) => {
  res.json(await historyService.goBack(req.params.pageId, readScope(req.body)));
});

historyRouter.post("/:pageId/forward", async (req, res) => {
  res.json(await historyService.goForward(req.params.pageId, readScope(req.body)));
});

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { HistoryEntry, HistoryScope, PageCardSnapshot, PageWithCards } from "@wattle/shared";
import * as api from "../api/client.js";
import {
  applyEntry,
  canGoBack as canGoBackSelector,
  canGoForward as canGoForwardSelector,
  canRedo as canRedoSelector,
  canUndo as canUndoSelector,
  ensureHistoryLoaded,
  getCachedHistory,
  subscribeToHistory,
} from "../lib/historyStore.js";

/** Reads one PageCard into the PageCardSnapshot shape historyService.ts's restore
 *  algorithm expects — the one place both App.tsx's structural-mutation wrapper and
 *  the generation hook-in build snapshots from, so they stay consistent. */
export function snapshotPageCard(pc: PageWithCards["pageCards"][number]): PageCardSnapshot {
  return {
    pageCardId: pc.id,
    order: pc.order,
    cardId: pc.card.id,
    title: pc.draftTitle ?? pc.card.title,
    content: pc.draftContent ?? pc.card.content,
    metadata: pc.card.metadata,
  };
}

/** The whole Page as PageCardSnapshot[] — used for structural entries (add/remove/
 *  move/reorder), which need every sibling's order to be able to restore it. */
export function snapshotWholePage(page: PageWithCards | null | undefined): PageCardSnapshot[] {
  return page ? page.pageCards.map(snapshotPageCard) : [];
}

/** Just the named PageCard(s) — used for content/metadata/generation entries, kept
 *  tight so a single-card selection's own scoped view doesn't drag in unrelated
 *  Page state. `cardIds` here are Card ids (PageCardSnapshot.cardId), not PageCard
 *  ids — matches HistoryEntry.cardIds' own convention. */
export function snapshotForCards(page: PageWithCards | null | undefined, cardIds: string[]): PageCardSnapshot[] {
  if (!page) return [];
  const wanted = new Set(cardIds);
  return page.pageCards.filter((pc) => wanted.has(pc.card.id)).map(snapshotPageCard);
}

export interface UseHistoryResult {
  /** "page" when nothing's selected, else the selected PageCards' own Card ids —
   *  the Dock's Undo/Redo/Back/Forward auto-scope to whatever this currently is. */
  scope: HistoryScope;
  canUndo: boolean;
  canRedo: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  /** Records one entry after a mutation this hook didn't itself perform (App.tsx's
   *  withHistory wrapper around structural mutations, and the generation hook-in) —
   *  `cardIds` here is the entry's own target/selection tag, independent of the
   *  live `scope` above (see PageCardSnapshot's doc comment on why). */
  record: (
    kind: "edit" | "generation",
    label: string,
    cardIds: string[],
    before: PageCardSnapshot[],
    after: PageCardSnapshot[],
  ) => Promise<void>;
}

/**
 * The full state system's page-level controller — Undo/Redo (manual edits) and
 * Back/Forward (generation versions), auto-scoped to whatever's currently selected
 * (see schema.prisma's HistoryEntry doc comment and the plan this implements).
 * `refreshPage` is `usePage(pageId)`'s own `refresh` — after every undo/redo/back/
 * forward this hook calls it so the restored PageCards/Cards actually show up,
 * rather than duplicating PageWithCards serialization server-side.
 */
export function useHistory(
  pageId: string | null,
  selectedCardIds: string[],
  refreshPage: () => Promise<PageWithCards | null | undefined>,
): UseHistoryResult {
  const entries = useSyncExternalStore(
    (onStoreChange) => (pageId ? subscribeToHistory(pageId, onStoreChange) : () => {}),
    () => (pageId ? (getCachedHistory(pageId) ?? []) : []),
  );

  useEffect(() => {
    if (pageId) void ensureHistoryLoaded(pageId);
  }, [pageId]);

  const scope: HistoryScope = selectedCardIds.length > 0 ? selectedCardIds : "page";

  const record = useCallback(
    async (
      kind: "edit" | "generation",
      label: string,
      cardIds: string[],
      before: PageCardSnapshot[],
      after: PageCardSnapshot[],
    ) => {
      if (!pageId) return;
      // Nothing actually changed (e.g. a debounced text-edit burst that ended up a
      // no-op) — never worth a history entry.
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      const entry = await api.recordHistoryEntry(pageId, kind, label, cardIds, before, after);
      applyEntry(pageId, entry);
    },
    [pageId],
  );

  const step = useCallback(
    async (call: (pageId: string, scope: HistoryScope) => Promise<HistoryEntry | null>) => {
      if (!pageId) return;
      const entry = await call(pageId, scope);
      if (!entry) return;
      applyEntry(pageId, entry);
      await refreshPage();
    },
    [pageId, scope, refreshPage],
  );

  const undo = useCallback(() => step(api.undoHistory), [step]);
  const redo = useCallback(() => step(api.redoHistory), [step]);
  const goBack = useCallback(() => step(api.goBackHistory), [step]);
  const goForward = useCallback(() => step(api.goForwardHistory), [step]);

  return useMemo(
    () => ({
      scope,
      canUndo: canUndoSelector(entries, scope),
      canRedo: canRedoSelector(entries, scope),
      canGoBack: canGoBackSelector(entries, scope),
      canGoForward: canGoForwardSelector(entries, scope),
      undo,
      redo,
      goBack,
      goForward,
      record,
    }),
    [scope, entries, undo, redo, goBack, goForward, record],
  );
}

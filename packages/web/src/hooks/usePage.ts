import { useCallback, useEffect, useRef, useState } from "react";
import type { PageWithCards } from "@wattle/shared";
import * as api from "../api/client.js";
import { publishCard, subscribeToSaves } from "../lib/cardStore.js";
import { publishPageTitle } from "../lib/pageTitleStore.js";

/** Loads and refreshes the single Page currently in view — a Page is a destination in
 *  its own right now (Pages + Links + Search rebuild), not a slot inside a Tab's
 *  stack, so this hook is scoped to one `pageId` rather than walking a parent Tab.
 *  Optimistic updates happen in the mutators below (spec1.md Part 4 "State & Data
 *  Layer"). `pageId` is null only during the brief window before App.tsx's Home
 *  bootstrap picks/creates one. */
export function usePage(pageId: string | null) {
  const [page, setPage] = useState<PageWithCards | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Same stale-response guard as the old usePages.ts's refreshSeq — overlapping
  // draft-keystroke refreshes, or a slow response for the *previous* Page landing
  // after a newer request for the new one, must never win over a later result.
  const refreshSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    if (!pageId) {
      setPage(null);
      setLoading(false);
      return;
    }
    try {
      const next = await api.getPage(pageId);
      if (seq !== refreshSeq.current) return;
      setPage(next);
      setError(null);
      if (next) {
        publishPageTitle(next.id, next.title);
        for (const pageCard of next.pageCards) {
          publishCard(pageCard.card);
        }
      }
    } catch (e) {
      if (seq !== refreshSeq.current) return;
      setError(e instanceof Error ? e.message : "Failed to load Page");
    } finally {
      if (seq === refreshSeq.current) setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A Card edited through an embed (cardStore.editCard) writes straight to the vault
  // with no Page/PageCard involved at all, so nothing above would otherwise trigger a
  // refresh() — see the old usePages.ts's identical doc comment.
  useEffect(() => subscribeToSaves(() => refresh()), [refresh]);

  const openCardIntoPage = useCallback(
    async (targetPageId: string, cardId: string) => {
      await api.addExistingCardToPage(targetPageId, cardId);
      await refresh();
    },
    [refresh],
  );

  const createCardInPage = useCallback(
    async (targetPageId: string, title: string, content: string, metadata?: unknown) => {
      const pageCard = await api.addNewCardToPage(targetPageId, title, content, metadata);
      await refresh();
      return pageCard;
    },
    [refresh],
  );

  const uploadFileToPage = useCallback(
    async (targetPageId: string, file: File) => {
      await api.uploadFileToPage(targetPageId, file);
      await refresh();
    },
    [refresh],
  );

  /** Synchronously patches one PageCard's draft fields in local state — the
   *  optimistic half of a draft edit, same reasoning as the old usePages.ts's
   *  identically-named function (React reconciles a controlled input's DOM value
   *  back to its prop on every render, so nothing else updates it between
   *  keystrokes and the async refresh() that eventually follows). */
  const updateDraftLocally = useCallback((pageCardId: string, draft: { title?: string; content?: string }) => {
    setPage((prev) =>
      prev
        ? {
            ...prev,
            pageCards: prev.pageCards.map((pc) =>
              pc.id === pageCardId
                ? {
                    ...pc,
                    draftTitle: draft.title ?? pc.draftTitle,
                    draftContent: draft.content ?? pc.draftContent,
                  }
                : pc,
            ),
          }
        : prev,
    );
  }, []);

  return {
    page,
    loading,
    error,
    refresh,
    openCardIntoPage,
    createCardInPage,
    uploadFileToPage,
    updateDraftLocally,
  };
}

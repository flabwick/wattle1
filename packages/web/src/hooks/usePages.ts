import { useCallback, useEffect, useRef, useState } from "react";
import type { PageWithCards } from "@wattle/shared";
import * as api from "../api/client.js";
import { publishCard, subscribeToSaves } from "../lib/cardStore.js";

/** Loads and refreshes the Page stack. Optimistic updates happen in the mutators
 *  below (spec1.md Part 4 "State & Data Layer"): the UI updates immediately and the
 *  server call confirms after, rather than blocking every interaction on a round-trip. */
export function usePages() {
  const [pages, setPages] = useState<PageWithCards[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Every draft keystroke (Card.tsx's onChangeDraft) calls refresh() — typing fast
  // enough overlaps multiple in-flight GET /api/pages requests, which can resolve out
  // of order. Without this guard, whichever response happens to land last wins even
  // if it's for an earlier, now-stale keystroke, silently reverting later ones. Only
  // ever applying the result of the most recently *initiated* call keeps state
  // consistent with what was actually typed, regardless of response ordering.
  const refreshSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    try {
      const next = await api.listPages();
      if (seq !== refreshSeq.current) return;
      setPages(next);
      setError(null);
      // Every Card this fetch sees is the vault's current source of truth for it —
      // publish each into the shared cardStore (CardEmbed.tsx/useCard.ts) so any
      // mounted embed of the same id picks up changes made through the top-level
      // Page/Save flow immediately, instead of only on its own next fetch.
      for (const page of next) {
        for (const pageCard of page.pageCards) {
          publishCard(pageCard.card);
        }
      }
    } catch (e) {
      if (seq !== refreshSeq.current) return;
      setError(e instanceof Error ? e.message : "Failed to load pages");
    } finally {
      if (seq === refreshSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The other direction: a Card edited through an embed (cardStore.editCard) writes
  // straight to the vault with no Page/PageCard involved at all, so nothing above
  // would otherwise trigger a refresh() — meaning a top-level PageCard showing that
  // same Card elsewhere would keep displaying its stale pre-edit content. Refresh
  // whenever the store reports a durable save, so that PageCard's `card.content`
  // (there's no draft standing in front of it, so it always shows straight through)
  // catches up too.
  useEffect(() => subscribeToSaves(() => refresh()), [refresh]);

  const addPage = useCallback(
    async (order?: number) => {
      const page = await api.createPage(order);
      await refresh();
      return page.id;
    },
    [refresh],
  );

  const removePage = useCallback(
    async (pageId: string) => {
      setPages((prev) => prev.filter((p) => p.id !== pageId));
      await api.deletePage(pageId);
      await refresh();
    },
    [refresh],
  );

  const openCardIntoPage = useCallback(
    async (pageId: string, cardId: string) => {
      await api.addExistingCardToPage(pageId, cardId);
      await refresh();
    },
    [refresh],
  );

  const createCardInPage = useCallback(
    async (pageId: string, title: string, content: string) => {
      await api.addNewCardToPage(pageId, title, content);
      await refresh();
    },
    [refresh],
  );

  const generate = useCallback(
    async (pageCardId: string) => {
      await api.generateFromPageCard(pageCardId);
      await refresh();
    },
    [refresh],
  );

  const uploadFileToPage = useCallback(
    async (pageId: string, file: File) => {
      await api.uploadFileToPage(pageId, file);
      await refresh();
    },
    [refresh],
  );

  /** Synchronously patches one PageCard's draft fields in local state — the
   *  optimistic half of a draft edit (App.tsx's handleChangeDraft calls this
   *  immediately, before the PATCH even goes out). Without this, the content
   *  textarea would be a controlled input with nothing updating its value between
   *  keystrokes and the (async, network-bound) refresh() that eventually follows —
   *  React reconciles a controlled input's DOM value back to its prop on every
   *  render, so any incidental re-render mid-typing (there's no shortage of causes
   *  in a tree this size) would silently erase whatever was typed since the last
   *  server round-trip landed. */
  const updateDraftLocally = useCallback(
    (pageCardId: string, draft: { title?: string; content?: string }) => {
      setPages((prev) =>
        prev.map((page) => ({
          ...page,
          pageCards: page.pageCards.map((pc) =>
            pc.id === pageCardId
              ? {
                  ...pc,
                  draftTitle: draft.title ?? pc.draftTitle,
                  draftContent: draft.content ?? pc.draftContent,
                }
              : pc,
          ),
        })),
      );
    },
    [],
  );

  return {
    pages,
    loading,
    error,
    refresh,
    addPage,
    removePage,
    openCardIntoPage,
    createCardInPage,
    generate,
    uploadFileToPage,
    updateDraftLocally,
  };
}

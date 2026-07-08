import { useCallback, useEffect, useState } from "react";
import type { PageWithCards } from "@wattle/shared";
import * as api from "../api/client.js";

/** Loads and refreshes the Page stack. Optimistic updates happen in the mutators
 *  below (spec1.md Part 4 "State & Data Layer"): the UI updates immediately and the
 *  server call confirms after, rather than blocking every interaction on a round-trip. */
export function usePages() {
  const [pages, setPages] = useState<PageWithCards[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPages(await api.listPages());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addPage = useCallback(async () => {
    await api.createPage();
    await refresh();
  }, [refresh]);

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

  return { pages, loading, error, refresh, addPage, removePage, openCardIntoPage, createCardInPage, generate };
}

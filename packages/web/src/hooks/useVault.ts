import { useCallback, useEffect, useState } from "react";
import type { Card, Page, PageSummary } from "@wattle/shared";
import * as api from "../api/client.js";
import { publishCard, subscribeToSaves } from "../lib/cardStore.js";

/**
 * The vault, reframed as pure search (Pages + Links + Search rebuild) — a flat
 * search across every Page (by title) and Card (by title/content) on every
 * keystroke, no folder tree to browse. An empty query still searches (both
 * `api.listCards`/`api.searchPages` treat `undefined` as "the widest reasonable
 * listing", not "nothing") — see VaultView.tsx's own doc comment.
 */
export function useVault() {
  const [cards, setCards] = useState<Card[]>([]);
  const [pages, setPages] = useState<PageSummary[]>([]);
  /** Every Home (Homes + Pages hierarchy, Phase 2) — Search's own empty-state
   *  fallback (VaultView.tsx), so a zero-match search still offers somewhere to
   *  go instead of a dead end. */
  const [homes, setHomes] = useState<PageSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (q?: string) => {
    setLoading(true);
    const [nextCards, nextPages, nextHomes] = await Promise.all([
      api.listCards(q),
      api.searchPages(q),
      api.listHomes(),
    ]);
    setCards(nextCards);
    setPages(nextPages);
    setHomes(nextHomes);
    setLoading(false);
    // Every Card this fetch sees is the vault's current source of truth for it —
    // publish each into the shared cardStore so any mounted embed of the same id
    // picks up changes made through the Vault panel, same as usePage.ts's refresh().
    for (const card of nextCards) {
      publishCard(card);
    }
  }, []);

  // Debounced — search-as-you-type shouldn't fire a request per keystroke.
  useEffect(() => {
    const handle = setTimeout(() => refresh(query || undefined), 200);
    return () => clearTimeout(handle);
  }, [query, refresh]);

  // A Card saved anywhere else (the top-level Save action in App.tsx, or an embed
  // edited in place) durably lands in the vault without this panel's own debounced
  // timer knowing about it. Refresh on every such save so the list — and any Card
  // content shown within it — catches up immediately instead of waiting up to 200ms
  // for unrelated query-driven polling, or going stale indefinitely if the query
  // never changes.
  useEffect(() => subscribeToSaves(() => refresh(query || undefined)), [refresh, query]);

  const createCard = useCallback(
    async (title: string): Promise<Card> => {
      const card = await api.createCard({ title, content: "" });
      await refresh(query || undefined);
      return card;
    },
    [query, refresh],
  );

  /** The Vault panel's own Upload action (Dock.tsx's "vault open, nothing selected"
   *  row). */
  const uploadFile = useCallback(
    async (file: File): Promise<Card> => {
      const card = await api.uploadFileToVault(file);
      await refresh(query || undefined);
      return card;
    },
    [query, refresh],
  );

  const renameCard = useCallback(
    async (id: string, title: string) => {
      await api.updateCard(id, { title });
      await refresh(query || undefined);
    },
    [query, refresh],
  );

  const deleteCard = useCallback(async (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    await api.deleteCard(id);
  }, []);

  /** Search's own "Create Home" (Homes + Pages hierarchy, Phase 2) — a Home is just
   *  a parentless Page (already `createPage`'s own default), so this is the exact
   *  same `api.createPage` every other Page-creation path already calls, not a new
   *  endpoint. "Create Home anything" — the caller passes the current search query
   *  as the title, so the new Home starts named after whatever didn't match. */
  const createHome = useCallback(
    async (title?: string): Promise<Page> => {
      const home = await api.createPage(title);
      await refresh(query || undefined);
      return home;
    },
    [query, refresh],
  );

  return {
    cards,
    pages,
    homes,
    query,
    setQuery,
    createCard,
    uploadFile,
    renameCard,
    deleteCard,
    createHome,
    loading,
    refresh,
  };
}

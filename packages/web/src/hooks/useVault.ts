import { useCallback, useEffect, useState } from "react";
import type { Card, Folder, FolderContents } from "@wattle/shared";
import * as api from "../api/client.js";
import { publishCard, subscribeToSaves } from "../lib/cardStore.js";

/**
 * The vault: a flat search across every Card (spec1.md Part 3 "Vault") when `query`
 * is non-empty, or a folder-by-folder browse of `currentFolderId`'s contents when it
 * isn't. The two are mutually exclusive views over the same underlying Cards — search
 * deliberately ignores folder boundaries; browsing shows exactly one folder at a time.
 */
export function useVault() {
  const [cards, setCards] = useState<Card[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderContents, setFolderContents] = useState<FolderContents | null>(null);

  const refresh = useCallback(async (q?: string) => {
    setLoading(true);
    const next = await api.listCards(q);
    setCards(next);
    setLoading(false);
    // Every Card this fetch sees is the vault's current source of truth for it —
    // publish each into the shared cardStore so any mounted embed of the same id
    // picks up changes made through the Vault panel, same as usePages.ts's refresh().
    for (const card of next) {
      publishCard(card);
    }
  }, []);

  const refreshFolder = useCallback(async (folderId: string | null) => {
    setLoading(true);
    const contents = await api.getFolderContents(folderId);
    setFolderContents(contents);
    setLoading(false);
    for (const card of contents.cards) {
      publishCard(card);
    }
  }, []);

  // Debounced — only search-as-you-type needs this; a burst of keystrokes shouldn't
  // fire a request per character.
  useEffect(() => {
    if (!query) return;
    const handle = setTimeout(() => refresh(query), 200);
    return () => clearTimeout(handle);
  }, [query, refresh]);

  // Folder navigation, deliberately NOT debounced: `folderContents` (in particular
  // `.folder`, which Dock.tsx's Move action targets — see VaultView.tsx's "Move
  // Here" row) needs to be current the instant `currentFolderId` changes, or a fast
  // "click a breadcrumb, then click Move Here" can read the *previous* Folder and
  // move something to the wrong place. Also covers the initial root fetch on mount
  // and clearing the search query back to a browse view.
  useEffect(() => {
    if (query) return;
    refreshFolder(currentFolderId);
  }, [query, currentFolderId, refreshFolder]);

  // A Card saved anywhere else (the top-level Save action in App.tsx, or an embed
  // edited in place) durably lands in the vault without this panel's own debounced
  // timer knowing about it. Refresh on every such save so the list — and any Card
  // content shown within it — catches up immediately instead of waiting up to 200ms
  // for unrelated query-driven polling, or going stale indefinitely if the query
  // never changes.
  useEffect(
    () => subscribeToSaves(() => (query ? refresh(query) : refreshFolder(currentFolderId))),
    [refresh, refreshFolder, query, currentFolderId],
  );

  /** Drills into a Folder (or back to the vault root, for `null`) — clears whatever
   *  search was active, since browsing and searching are mutually exclusive views. */
  const openFolder = useCallback((folderId: string | null) => {
    setQuery("");
    setCurrentFolderId(folderId);
  }, []);

  const createFolder = useCallback(
    async (title: string): Promise<Folder> => {
      const folder = await api.createFolder(title, currentFolderId);
      await refreshFolder(currentFolderId);
      return folder;
    },
    [currentFolderId, refreshFolder],
  );

  const renameFolder = useCallback(
    async (id: string, title: string) => {
      await api.renameFolder(id, title);
      await refreshFolder(currentFolderId);
    },
    [currentFolderId, refreshFolder],
  );

  /** Reparents a Folder, then refreshes the currently browsed Folder's contents —
   *  covers both directions: the moved Folder disappearing from the view it used to
   *  be in, and appearing in the view it was just moved into (Dock.tsx's Move flow
   *  navigates to the destination *before* confirming the move — see its "Move
   *  Here" row — so by the time this resolves, `currentFolderId` already points
   *  there). Selecting a Folder no longer requires browsing it (see Dock.tsx's
   *  vault selection model), so the moved Folder and the one currently browsed may
   *  be unrelated — refreshing here rather than leaving it to the caller covers
   *  every case uniformly. */
  const moveFolder = useCallback(
    async (id: string, parentId: string | null) => {
      await api.moveFolder(id, parentId);
      await refreshFolder(currentFolderId);
    },
    [currentFolderId, refreshFolder],
  );

  /** Deletes a Folder, then refreshes the currently browsed Folder's contents — covers
   *  deleting a merely-selected subfolder (it should vanish from the list) just as
   *  well as deleting the Folder currently browsed (the caller navigates away right
   *  after — see Dock.tsx's vaultDeleteFolder action — which triggers its own
   *  refetch of the parent; this one's response just gets superseded). */
  const deleteFolder = useCallback(
    async (id: string) => {
      await api.deleteFolder(id);
      await refreshFolder(currentFolderId);
    },
    [currentFolderId, refreshFolder],
  );

  const createCardInCurrentFolder = useCallback(
    async (title: string): Promise<Card> => {
      const card = await api.createCard({ title, content: "", folderId: currentFolderId });
      await refreshFolder(currentFolderId);
      return card;
    },
    [currentFolderId, refreshFolder],
  );

  /** The Vault panel's own Upload action (Dock.tsx's "vault open, nothing selected"
   *  row) — uploads straight into whichever Folder is currently browsed. */
  const uploadFile = useCallback(
    async (file: File): Promise<Card> => {
      const card = await api.uploadFileToVault(file, currentFolderId);
      await refreshFolder(currentFolderId);
      return card;
    },
    [currentFolderId, refreshFolder],
  );

  const renameCard = useCallback(
    async (id: string, title: string) => {
      await api.updateCard(id, { title });
      await (query ? refresh(query) : refreshFolder(currentFolderId));
    },
    [query, currentFolderId, refresh, refreshFolder],
  );

  const moveCard = useCallback(
    async (id: string, folderId: string | null) => {
      await api.moveCard(id, folderId);
      await (query ? refresh(query) : refreshFolder(currentFolderId));
    },
    [query, currentFolderId, refresh, refreshFolder],
  );

  const deleteCard = useCallback(
    async (id: string) => {
      setCards((prev) => prev.filter((c) => c.id !== id));
      setFolderContents((prev) => (prev ? { ...prev, cards: prev.cards.filter((c) => c.id !== id) } : prev));
      await api.deleteCard(id);
    },
    [],
  );

  return {
    // Search
    cards,
    query,
    setQuery,
    // Browse
    currentFolderId,
    folderContents,
    openFolder,
    // Mutations
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
    createCardInCurrentFolder,
    uploadFile,
    renameCard,
    moveCard,
    deleteCard,
    loading,
    refresh,
  };
}

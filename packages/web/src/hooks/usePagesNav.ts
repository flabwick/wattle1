import { useCallback, useEffect, useState } from "react";
import type { PageSummary } from "@wattle/shared";
import * as api from "../api/client.js";

/** Home + the scarce pin rail (Pages + Links + Search rebuild, Phase 4) — the "New
 *  user understands capture → new Page → link from Home" exit criteria's chrome.
 *  Deliberately separate from the Vault panel's own Page *search* (useVault.ts) —
 *  this is quick access to a short, curated list, not a query. */
export function usePagesNav() {
  const [homePageId, setHomePageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinned, setPinnedList] = useState<PageSummary[]>([]);

  const refreshSettings = useCallback(async () => {
    const settings = await api.getSettings();
    setHomePageId(settings.homePageId);
    setLoading(false);
  }, []);

  const refreshPinned = useCallback(async () => {
    setPinnedList(await api.listPinnedPages());
  }, []);

  useEffect(() => {
    refreshSettings();
    refreshPinned();
  }, [refreshSettings, refreshPinned]);

  const setHome = useCallback(async (pageId: string) => {
    const settings = await api.setHomePage(pageId);
    setHomePageId(settings.homePageId);
  }, []);

  /** Toggles `pageId`'s pin state — unpinning clears `pinnedOrder`; pinning appends it
   *  at the end of the current pinned list (App.tsx doesn't need to reason about
   *  ordering itself; the scarce list is small enough that "append" is always a fine
   *  default — reordering, if ever needed, is a `setPagePinned` call away). */
  const togglePin = useCallback(
    async (pageId: string) => {
      const isPinned = pinned.some((p) => p.id === pageId);
      await api.setPagePinned(pageId, isPinned ? null : pinned.length);
      await refreshPinned();
    },
    [pinned, refreshPinned],
  );

  return { homePageId, loading, setHome, pinned, refreshPinned, togglePin };
}

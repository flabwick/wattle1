import { useCallback, useEffect, useState } from "react";
import type { Tab } from "@wattle/shared";
import * as api from "../api/client.js";

/** Loads and refreshes the Tab row — the horizontal layer above Pages (Step 6 spec
 *  §1.1). Each Tab holds its own independent Page stack; this hook only tracks the
 *  Tabs themselves, not their Pages (see usePages.ts, which is scoped per-Tab). */
export function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await api.listTabs();
    setTabs(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createTab = useCallback(
    async (title?: string) => {
      const tab = await api.createTab(title);
      await refresh();
      return tab;
    },
    [refresh],
  );

  const deleteTab = useCallback(
    async (id: string) => {
      await api.deleteTab(id);
      await refresh();
    },
    [refresh],
  );

  return { tabs, loading, refresh, createTab, deleteTab };
}

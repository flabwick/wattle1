import { useCallback, useEffect, useState } from "react";
import type { PageSummary } from "@wattle/shared";
import * as api from "../api/client.js";

/** The breadcrumb's own data (Homes + Pages hierarchy, Phase 1) — root-first parent
 *  chain for the current Page, excluding the Page itself. Empty for a Home (no
 *  parent) — that absence *is* the "this is a Home" signal, no separate flag to
 *  check. Same fetch-on-`pageId`-change shape as useSiblingPages.ts. */
export function usePageAncestors(pageId: string | null) {
  const [ancestors, setAncestors] = useState<PageSummary[]>([]);

  const refresh = useCallback(async () => {
    if (!pageId) {
      setAncestors([]);
      return;
    }
    const next = await api.listPageAncestors(pageId);
    setAncestors(next);
  }, [pageId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ancestors, refresh };
}

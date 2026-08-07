import { useCallback, useEffect, useState } from "react";
import type { PageSummary } from "@wattle/shared";
import * as api from "../api/client.js";

/** The optional next/prev trail for a Page that still has former stack-mates (Pages +
 *  Links + Search rebuild, Phase 3) — empty for the common case of a loose Page with
 *  no `siblingGroupId`. Deliberately not the main IA (Home/Links/Search is); this only
 *  powers the Dock's up/down arrows and the "1/N" count badge when there's something
 *  for them to do. */
export function useSiblingPages(pageId: string | null) {
  const [siblings, setSiblings] = useState<PageSummary[]>([]);

  const refresh = useCallback(async () => {
    if (!pageId) {
      setSiblings([]);
      return;
    }
    const next = await api.listSiblingPages(pageId);
    setSiblings(next);
  }, [pageId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const index = siblings.findIndex((p) => p.id === pageId);

  return {
    siblings,
    refresh,
    index,
    canNavigateUp: index > 0,
    canNavigateDown: index !== -1 && index < siblings.length - 1,
    previousId: index > 0 ? siblings[index - 1].id : null,
    nextId: index !== -1 && index < siblings.length - 1 ? siblings[index + 1].id : null,
  };
}

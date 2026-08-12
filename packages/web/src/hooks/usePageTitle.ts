import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import { ensurePageTitleFetched, getCachedPageTitle, subscribeToPageTitle } from "../lib/pageTitleStore.js";

/** A Page's current title, live — subscribes to pageTitleStore.ts's shared cache and
 *  triggers a fetch the first time this pageId is seen. Returns `undefined` until a
 *  title (fresh or stale-but-confirmed) is known at all — see PageLinkNodeView.tsx's
 *  own fallback-to-the-stored-snapshot handling of that. */
export function usePageTitle(pageId: string): string | null | undefined {
  useEffect(() => {
    ensurePageTitleFetched(pageId);
  }, [pageId]);

  return useSyncExternalStore(
    (onChange) => subscribeToPageTitle(pageId, onChange),
    () => getCachedPageTitle(pageId),
  );
}

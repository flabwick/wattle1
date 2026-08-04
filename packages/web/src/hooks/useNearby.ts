import { useEffect, useRef, useState } from "react";
import type { NearbyItem } from "@wattle/shared";
import * as api from "../api/client.js";

/** How long to wait after the last change to `draftText`/`focusedCardId` before
 *  actually calling the live-rank endpoint — nearbyService.ts's heuristic is cheap,
 *  but there's no reason to fire it on every single keystroke either. */
const DEBOUNCE_MS = 400;

/**
 * The Nearby panel's live data source (Wattle vault plan's "live rank") — re-scored
 * against whatever's open on `pageId` and whatever's currently in `draftText`
 * (the Card currently being typed into, if any). Only fetches while `enabled` (the
 * panel is actually open) — there's no reason to hit the endpoint on every keystroke
 * across the whole app when nobody's looking at the result.
 */
export function useNearby(pageId: string | null, focusedCardId: string | null, draftText: string, enabled: boolean) {
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (!enabled || !pageId) {
      setItems([]);
      return;
    }
    setLoading(true);
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const results = await api.getLiveNearby({
          pageId,
          focusedCardId: focusedCardId ?? undefined,
          draftText: draftText || undefined,
        });
        if (requestId.current === id) {
          setItems(results);
          setLoading(false);
        }
      } catch {
        if (requestId.current === id) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pageId, focusedCardId, draftText, enabled]);

  return { items, loading };
}

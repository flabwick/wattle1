import { useEffect, useState, useSyncExternalStore } from "react";
import type { Card } from "@wattle/shared";
import { ensureCardLoaded, getCachedCard, subscribeToCard } from "../lib/cardStore.js";

export type CardLoadState = "loading" | "ready" | "error";

/** Subscribes to a single vault Card in the shared cardStore — the read half of
 *  CardEmbed.tsx's live-sync (see cardStore.ts's doc comment): re-renders whenever
 *  *any* mounted component edits this same cardId, not just this one. */
export function useCard(cardId: string): { card: Card | undefined; state: CardLoadState } {
  const card = useSyncExternalStore(
    (onStoreChange) => subscribeToCard(cardId, onStoreChange),
    () => getCachedCard(cardId),
  );
  const [state, setState] = useState<CardLoadState>(() => (getCachedCard(cardId) ? "ready" : "loading"));

  useEffect(() => {
    let cancelled = false;
    setState(getCachedCard(cardId) ? "ready" : "loading");
    ensureCardLoaded(cardId)
      .then(() => {
        if (!cancelled) setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  return { card, state };
}

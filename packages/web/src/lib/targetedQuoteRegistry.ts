import { useSyncExternalStore } from "react";

/** Which Quote (quotesRegistry.ts), if any, was last clicked — clicking a Quote's
 *  own highlight no longer opens a floating popup; it just marks that Quote as the
 *  target, and the Dock's own action row shows a "Deselect quote" (X) button for it
 *  (Dock.tsx) — same "child publishes to a small external store, Dock reads it"
 *  shape as activeEditorRegistry.ts/activeStackRegistry.ts. Only one Quote can be
 *  targeted at a time; clicking a different one just re-targets. */
let targetedQuoteId: string | null = null;
const listeners = new Set<() => void>();

export function setTargetedQuote(id: string | null): void {
  if (targetedQuoteId === id) return;
  targetedQuoteId = id;
  listeners.forEach((listener) => listener());
}

export function getTargetedQuote(): string | null {
  return targetedQuoteId;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTargetedQuote(): string | null {
  return useSyncExternalStore(subscribe, getTargetedQuote);
}

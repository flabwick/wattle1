import { useSyncExternalStore } from "react";

/** The current *live* (not yet confirmed) browser text selection inside some Card's
 *  rich text — continuously updated on every `selectionchange` tick
 *  (useGlobalSelectionTracking.ts), unlike quotesRegistry.ts's `Quote`s, which only
 *  ever change on an explicit action (Dock.tsx's "Quote" button). Purely so the Dock
 *  knows whether to show that button at all, and what to turn into a Quote if it's
 *  clicked — nothing here drives any decoration/rendering, so there's no perf
 *  concern updating this on every character selected while dragging (unlike the
 *  earlier design, which fed a live-tracked selection straight into a ProseMirror
 *  decoration recompute on every tick and was visibly janky). */
export interface LiveSelection {
  cardId: string;
  text: string;
}

let current: LiveSelection | null = null;
const listeners = new Set<() => void>();

export function setLiveSelection(next: LiveSelection | null): void {
  if (current?.cardId === next?.cardId && current?.text === next?.text) return;
  current = next;
  listeners.forEach((listener) => listener());
}

export function getLiveSelection(): LiveSelection | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLiveSelection(): LiveSelection | null {
  return useSyncExternalStore(subscribe, getLiveSelection);
}

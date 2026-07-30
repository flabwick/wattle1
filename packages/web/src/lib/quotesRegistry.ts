import { useSyncExternalStore } from "react";

/** One confirmed "Quote" — a span of text the user explicitly turned into part of
 *  the current selection (Dock.tsx's "Quote" action, quotation-mark icon), alongside
 *  whatever Cards are also selected. Several can exist at once, even within the same
 *  Card — each gets its own persistent Kindle-style highlight
 *  (SelectionHighlightDecoration.ts) and its own entry in the Dock's "# words, #
 *  cards, # quotes" summary. Never persisted (gone on reload, same as
 *  selectedPageCardIds) — this is ephemeral context-gathering state, not an
 *  annotation. */
export interface Quote {
  id: string;
  /** Which Card's rich text this Quote is inside — lets that one CardRichText
   *  instance (and only that one) render its highlight decoration. */
  cardId: string;
  text: string;
}

let quotes: readonly Quote[] = [];
const listeners = new Set<() => void>();

function publish(next: readonly Quote[]): void {
  quotes = next;
  listeners.forEach((listener) => listener());
}

/** Turns the current live selection (liveSelectionRegistry.ts) into a persistent
 *  Quote — Dock.tsx's own "Quote" action, the only place this is ever called. */
export function addQuote(quote: Quote): void {
  publish([...quotes, quote]);
}

/** Removes one specific Quote — the highlighted text's own "deselect" popup
 *  (Dock.tsx's "Deselect quote" action, once that Quote's own highlight is clicked
 *  — see targetedQuoteRegistry.ts). */
export function removeQuote(id: string): void {
  publish(quotes.filter((q) => q.id !== id));
}

/** Removes every Quote at once — the Dock's own dismiss button. */
export function clearQuotes(): void {
  if (quotes.length === 0) return;
  publish([]);
}

export function getQuotes(): readonly Quote[] {
  return quotes;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useQuotes(): readonly Quote[] {
  return useSyncExternalStore(subscribe, getQuotes);
}

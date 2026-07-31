import { useSyncExternalStore } from "react";

/** One confirmed "Quote" — a span of text the user explicitly turned into part of
 *  the current selection (SelectionMenu.tsx's quotation-mark icon, shown on any text
 *  selection), alongside whatever Cards/embeds are also selected. Several can exist
 *  at once, even within the same Card — each gets its own persistent Kindle-style
 *  highlight
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

/** Turns the current text selection into a persistent Quote — SelectionMenu.tsx's
 *  quotation-mark button, the only place this is ever called. */
export function addQuote(quote: Quote): void {
  publish([...quotes, quote]);
}

/** Removes one specific Quote — clicking that Quote's own highlight opens a small
 *  local popup (CardRichText.tsx) with just this. */
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

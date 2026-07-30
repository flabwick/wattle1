import { useEffect } from "react";
import { setLiveSelection } from "../lib/liveSelectionRegistry.js";

/**
 * Tracks the live browser text selection across the whole app (one document-level
 * `selectionchange` listener, not one per rendered Card) and publishes it to
 * liveSelectionRegistry.ts whenever it's inside a Card's rich text — `.card-rich-text`
 * is the container class every CardRichText.tsx instance renders (root or embedded,
 * read-only or mid-edit), stamped with its own `data-card-id` so this can tell which
 * Card the selection belongs to without per-instance wiring.
 *
 * This only ever updates the *live* registry, never quotesRegistry.ts directly —
 * turning a selection into a persistent Quote is always an explicit action (the
 * Dock's own "Quote" button), never automatic. Call once, at the top of the app
 * (App.tsx).
 */
export function useGlobalSelectionTracking(): void {
  useEffect(() => {
    function handleSelectionChange() {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed) {
        setLiveSelection(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const anchorEl =
        range.commonAncestorContainer instanceof Element
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
      const container = anchorEl?.closest<HTMLElement>(".card-rich-text");
      const cardId = container?.dataset.cardId;
      if (!container || !cardId) {
        setLiveSelection(null);
        return;
      }
      const text = selection.toString().trim();
      if (!text) {
        setLiveSelection(null);
        return;
      }
      setLiveSelection({ cardId, text });
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);
}

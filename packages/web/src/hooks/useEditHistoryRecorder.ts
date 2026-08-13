import { useEffect, useRef } from "react";
import type { PageCardSnapshot } from "@wattle/shared";

/** How long a title/content burst can sit idle before it settles into its own
 *  Undo/Redo entry — the confirmed coarse-grained decision (one step per pause, not
 *  per keystroke), same order of magnitude as Google Docs' own revision coalescing. */
const DEBOUNCE_MS = 1500;

export interface UseEditHistoryRecorderParams {
  /** False while the Card isn't actually editable (Frozen, or between edit
   *  sessions) — no baseline is tracked and nothing is ever committed. */
  enabled: boolean;
  pageCardId: string;
  cardId: string;
  order: number;
  title: string;
  content: string;
  metadata: unknown;
  onCommit: (before: PageCardSnapshot, after: PageCardSnapshot) => void;
}

/**
 * Coalesces one Card's title/content changes into a single Undo/Redo history entry
 * per pause or edit session, rather than one per keystroke. Purely an observer —
 * the existing live-save path (Card.tsx's editCard/onChangeDraft calls, which fire
 * on every keystroke exactly as before) is untouched; this just watches the same
 * title/content values Card.tsx already derives and reports settled bursts via
 * `onCommit`, which App.tsx wires to `history.record("edit", ...)`.
 */
export function useEditHistoryRecorder({
  enabled,
  pageCardId,
  cardId,
  order,
  title,
  content,
  metadata,
  onCommit,
}: UseEditHistoryRecorderParams): void {
  const baselineRef = useRef<PageCardSnapshot | null>(null);
  const latestRef = useRef<PageCardSnapshot>({ pageCardId, cardId, order, title, content, metadata });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const baseline = baselineRef.current;
    const latest = latestRef.current;
    baselineRef.current = latest;
    if (baseline && (baseline.title !== latest.title || baseline.content !== latest.content)) {
      onCommitRef.current(baseline, latest);
    }
  };

  // The debounce timer itself — restarts on every title/content change, fires
  // `flush` once DEBOUNCE_MS passes with no further change.
  useEffect(() => {
    const current: PageCardSnapshot = { pageCardId, cardId, order, title, content, metadata };
    latestRef.current = current;
    if (!enabled) return;
    if (baselineRef.current === null) {
      // First observation since the last commit (or since mount) — nothing to
      // debounce yet, just establishes what "before" means for the next burst.
      baselineRef.current = current;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- order/metadata carry
    // through the snapshot but never restart the debounce on their own.
  }, [pageCardId, cardId, title, content, enabled]);

  // Flushes immediately on an edit session boundary — `enabled` flipping to false
  // (editor closed) or the Card unmounting entirely — rather than waiting out the
  // full debounce. Deliberately its own effect, keyed only on `enabled`: if this
  // lived in the effect above (keyed on title/content too), it would flush on
  // every keystroke's cleanup instead of just at session boundaries.
  useEffect(() => {
    return () => flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

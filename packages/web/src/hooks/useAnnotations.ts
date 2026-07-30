import { useCallback, useState } from "react";
import * as api from "../api/client.js";
import type { AnnotationProcess } from "../api/client.js";
import { publishCard } from "../lib/cardStore.js";

export type { AnnotationProcess } from "../api/client.js";

export interface UseAnnotationsResult {
  /** True while a diff/footnote/highlight AI run is in flight (Dock's process
   *  spinner) — never true for the manual-highlight/accept/reject/edit-text paths,
   *  none of which call a model. */
  running: boolean;
  error: string | null;
  dismissError: () => void;
  /** Whole-card (selectionText omitted) or selection-scoped (selectionText given) AI
   *  run — see annotationService.runAnnotationProcess. Publishes every returned Card
   *  into the shared cardStore so every mounted view (embeds included) updates live.
   *  `pageCardId`, when the target is a top-level (not-yet-saved) Card currently open
   *  on a Page, lets the API resolve its draft content instead of the vault Card's
   *  own (possibly empty/stale) row — see annotationService.ts's resolveDraftTarget
   *  doc comment. Only Card.tsx ever supplies it (App.tsx's handle* wrappers).
   *  `instruction`, only meaningful for process "diff", drives the Dock's
   *  magic-button rewrite-in-place flow (App.tsx's handleRewriteSelected). */
  runProcess: (
    cardId: string,
    process: AnnotationProcess,
    selectionText?: string,
    pageCardId?: string,
    instruction?: string,
  ) => Promise<void>;
  createManualHighlight: (cardId: string, anchor: string, color: string, pageCardId?: string) => Promise<void>;
  acceptDiff: (cardId: string, annotationId: string, pageCardId?: string) => Promise<void>;
  acceptAllDiffs: (cardId: string, pageCardId?: string) => Promise<void>;
  removeAnnotation: (cardId: string, annotationId: string) => Promise<void>;
  updateAnnotationText: (cardId: string, annotationId: string, text: string) => Promise<void>;
}

/**
 * The annotation-processes counterpart to useGeneration.ts — no streaming/ghost-card
 * machinery here (these responses are short JSON, applied directly, never reviewed as
 * a draft first), just thin wrappers around the six client.ts calls that funnel every
 * result through cardStore.ts's publishCard, the same mechanism usePages.ts's
 * refresh() uses to push a freshly-fetched Card into every mounted view of it.
 */
export function useAnnotations(): UseAnnotationsResult {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TEMP DEBUG — remove once the annotation-run-doesn't-do-anything issue is
  // diagnosed. `guarded` is the one place every mutation's success/failure funnels
  // through, so logging here covers all six calls without repeating it six times.
  const guarded = useCallback(async (label: string, fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
      console.debug(`[annot] ${label} succeeded`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      console.debug(`[annot] ${label} FAILED:`, err);
      setError(message);
    }
  }, []);

  const runProcess = useCallback(
    async (
      cardId: string,
      process: AnnotationProcess,
      selectionText?: string,
      pageCardId?: string,
      instruction?: string,
    ) => {
      console.debug("[annot] runProcess called", { cardId, process, selectionText, pageCardId, instruction });
      setRunning(true);
      await guarded(`runProcess(${process})`, async () => {
        const selection = selectionText !== undefined ? { cardId, text: selectionText } : undefined;
        const { cards } = await api.runAnnotationProcess(process, cardId, selection, pageCardId, instruction);
        console.debug(`[annot] runProcess(${process}) got ${cards.length} updated card(s)`, cards);
        cards.forEach(publishCard);
      });
      setRunning(false);
    },
    [guarded],
  );

  const createManualHighlight = useCallback(
    async (cardId: string, anchor: string, color: string, pageCardId?: string) => {
      console.debug("[annot] createManualHighlight called", { cardId, anchor, color, pageCardId });
      await guarded("createManualHighlight", async () => {
        publishCard(await api.createManualHighlight(cardId, anchor, color, undefined, pageCardId));
      });
    },
    [guarded],
  );

  const acceptDiff = useCallback(
    async (cardId: string, annotationId: string, pageCardId?: string) => {
      console.debug("[annot] acceptDiff called", { cardId, annotationId, pageCardId });
      await guarded("acceptDiff", async () => {
        publishCard(await api.acceptDiff(cardId, annotationId, pageCardId));
      });
    },
    [guarded],
  );

  const acceptAllDiffs = useCallback(
    async (cardId: string, pageCardId?: string) => {
      console.debug("[annot] acceptAllDiffs called", { cardId, pageCardId });
      await guarded("acceptAllDiffs", async () => {
        publishCard(await api.acceptAllDiffs(cardId, pageCardId));
      });
    },
    [guarded],
  );

  const removeAnnotation = useCallback(
    async (cardId: string, annotationId: string) => {
      console.debug("[annot] removeAnnotation called", { cardId, annotationId });
      await guarded("removeAnnotation", async () => {
        publishCard(await api.removeAnnotation(cardId, annotationId));
      });
    },
    [guarded],
  );

  const updateAnnotationText = useCallback(
    async (cardId: string, annotationId: string, text: string) => {
      console.debug("[annot] updateAnnotationText called", { cardId, annotationId, text });
      await guarded("updateAnnotationText", async () => {
        publishCard(await api.updateAnnotationText(cardId, annotationId, text));
      });
    },
    [guarded],
  );

  return {
    running,
    error,
    dismissError: () => setError(null),
    runProcess,
    createManualHighlight,
    acceptDiff,
    acceptAllDiffs,
    removeAnnotation,
    updateAnnotationText,
  };
}

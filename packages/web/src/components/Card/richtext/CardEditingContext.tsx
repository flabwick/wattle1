import { createContext, useContext } from "react";
import type { PageCardWithCard } from "@wattle/shared";
import type { AnnotationProcess } from "../../../api/client.js";

/** Every prop CardEmbed needs beyond its own `cardId`/`onRemoveSelf` (which the
 *  NodeView derives from the ProseMirror node itself — see CardEmbedNodeView.tsx) —
 *  the same field set CardContent.tsx/CardContentEditor.tsx used to thread down as
 *  plain JSX props at each recursion level, carried via context instead since a
 *  TipTap NodeView mounts as a sibling in the document tree, not a JSX child of
 *  whatever rendered the editor. */
export interface CardEditingContextValue {
  ancestorIds: ReadonlySet<string>;
  depth: number;
  /** Every currently-selected embed's own cardId — several can be selected at once
   *  now, alongside top-level Cards, all feeding the Dock's combined selection
   *  (word/card/quote context) — see App.tsx's selectedEmbedIds. */
  selectedEmbedIds?: ReadonlySet<string>;
  onSelectEmbed?: (cardId: string, onRemove: () => void) => void;
  onRequestEditEmbed?: (cardId: string, onRemove: () => void) => void;
  editingEmbedIds: ReadonlySet<string>;
  onToggleEmbedEdit: (cardId: string) => void;
  onRunProcess?: (cardId: string, process: AnnotationProcess, selectionText?: string) => void;
  onCreateManualHighlight?: (cardId: string, anchor: string, color: string) => void;
  onAcceptDiff?: (cardId: string, annotationId: string) => void;
  onRemoveAnnotation?: (cardId: string, annotationId: string) => void;
  onUpdateAnnotationText?: (cardId: string, annotationId: string, text: string) => void;
  /** Hides the header's collapse/expand caret entirely — see CardEmbed.tsx. Only
   *  ever true for DockCardsPanel's own single-card view. */
  hideFoldButton?: boolean;
  /** Whether the surrounding CardRichText is in edit mode — ActionButtonNodeView.tsx
   *  uses this to decide whether a click should open its config popover (editing)
   *  or run its job (viewing). */
  editable: boolean;
  /** Only set at depth 0 (Card.tsx, the top-level Card actually placed on a Page) —
   *  an inline actionButton/actionField nested inside an *embedded* Card (depth > 0)
   *  has no Page of its own to place a new Card into or navigate from, so these stay
   *  undefined there and its button just renders inert (same "disabled, not broken"
   *  contract as an unrecognized jobId — see lib/actionJobs.ts). */
  ownerPageCard?: PageCardWithCard;
  onRunActionJob?: (
    pageCard: PageCardWithCard,
    jobId: string | undefined,
    jobParams: Record<string, unknown> | undefined,
  ) => void;
  generatingPageCardId?: string | null;
  pageSiblings?: PageCardWithCard[];
  /** Per-card registry of every actionField node's current (never-persisted) value —
   *  always a string regardless of the field's own `kind` (a slider/number/toggle's
   *  value is stringified) — keyed by its ProseMirror document position so an
   *  actionButton can gather them in document order at click time. See
   *  ActionButtonNodeView.tsx/ActionFieldNodeView.tsx. */
  registerActionFieldValue?: (pos: number, value: string) => void;
  unregisterActionFieldValue?: (pos: number) => void;
  getActionFieldValues?: () => string[];
}

export const CardEditingContext = createContext<CardEditingContextValue | null>(null);

/** Throws rather than silently rendering with nothing, since a cardEmbed node
 *  outside a CardRichText provider is a real bug, not a legitimate empty state. */
export function useCardEditingContext(): CardEditingContextValue {
  const ctx = useContext(CardEditingContext);
  if (!ctx) throw new Error("CardEmbedNodeView rendered outside a CardEditingContext.Provider");
  return ctx;
}

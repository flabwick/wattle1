import { createContext, useContext } from "react";
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
  selectedEmbedId?: string | null;
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
}

export const CardEditingContext = createContext<CardEditingContextValue | null>(null);

/** Throws rather than silently rendering with nothing, since a cardEmbed node
 *  outside a CardRichText provider is a real bug, not a legitimate empty state. */
export function useCardEditingContext(): CardEditingContextValue {
  const ctx = useContext(CardEditingContext);
  if (!ctx) throw new Error("CardEmbedNodeView rendered outside a CardEditingContext.Provider");
  return ctx;
}

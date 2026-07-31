import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { CardEmbed } from "../CardEmbed.js";
import { useCardEditingContext } from "./CardEditingContext.js";

/** The React NodeView for the `cardEmbed` node (richText/cardEmbedNode.ts) — the
 *  recursion point where the TipTap document meets the existing CardEmbed component
 *  tree. Everything CardEmbed needs beyond its own cardId comes from
 *  CardEditingContext (see that file's doc comment for why); `onRemoveSelf` is just
 *  `deleteNode()` now, strictly simpler than the old content.slice/splice hack it
 *  replaces. */
export function CardEmbedNodeView({ node, deleteNode }: NodeViewProps) {
  const ctx = useCardEditingContext();
  const cardId = node.attrs.cardId as string;

  return (
    <NodeViewWrapper data-card-embed-id={cardId}>
      <CardEmbed
        cardId={cardId}
        ancestorIds={ctx.ancestorIds}
        depth={ctx.depth}
        selectedEmbedIds={ctx.selectedEmbedIds}
        onSelectEmbed={ctx.onSelectEmbed}
        onRequestEditEmbed={ctx.onRequestEditEmbed}
        editingEmbedIds={ctx.editingEmbedIds}
        onToggleEmbedEdit={ctx.onToggleEmbedEdit}
        onRunProcess={ctx.onRunProcess}
        onCreateManualHighlight={ctx.onCreateManualHighlight}
        onAcceptDiff={ctx.onAcceptDiff}
        onRemoveAnnotation={ctx.onRemoveAnnotation}
        onUpdateAnnotationText={ctx.onUpdateAnnotationText}
        onRemoveSelf={() => deleteNode()}
        hideFoldButton={ctx.hideFoldButton}
      />
    </NodeViewWrapper>
  );
}

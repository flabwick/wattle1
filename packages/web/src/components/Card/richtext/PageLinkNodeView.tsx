import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { navigateToPageFromRichText } from "../../../lib/pageNavRegistry.js";

/** The React NodeView for the `pageLink` node (richText/pageLinkNode.ts) — renders as
 *  an inline chip, same visual register as an external-link mark, that navigates on
 *  click while the surrounding Card is *not* being edited (clicking inside a Card
 *  under edit should place the text cursor, same convention CardEmbed's own
 *  click-to-select follows before a second interaction opens anything). */
export function PageLinkNodeView({ node, editor }: NodeViewProps) {
  const pageId = node.attrs.pageId as string;
  const title = node.attrs.title as string;

  return (
    <NodeViewWrapper as="span" data-page-link-id={pageId} className="page-link-node">
      <button
        type="button"
        className="page-link-node__chip"
        contentEditable={false}
        onClick={(e) => {
          if (editor.isEditable) {
            // Mid-edit, a click should behave like clicking any other inline content
            // (place the cursor) rather than always navigating away — but ProseMirror
            // already treats this atom as a single cursor position either side of, so
            // stopping propagation only matters for the *not-editing* (View) case
            // below, where navigating is exactly what a click on rendered text should do.
            return;
          }
          e.preventDefault();
          navigateToPageFromRichText(pageId);
        }}
      >
        {title}
      </button>
    </NodeViewWrapper>
  );
}

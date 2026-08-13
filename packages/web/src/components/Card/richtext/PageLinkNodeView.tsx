import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { navigateToPageFromRichText } from "../../../lib/pageNavRegistry.js";
import { usePageTitle } from "../../../hooks/usePageTitle.js";
import { useCardEditingContext } from "./CardEditingContext.js";
import { ElementControls } from "./ElementControls.js";
import { t } from "../../../i18n/index.js";

/** The React NodeView for the `pageLink` node (richText/pageLinkNode.ts) — renders as
 *  an inline chip, same visual register as an external-link mark, that navigates on
 *  click. A Card's rich text is always directly editable now (Card.tsx's
 *  `editable={!isFrozen}` — there's no separate view/edit mode to gate on), so a
 *  click always navigates rather than only doing so while some notional "not being
 *  edited" state held; it's an atom with no text of its own to place a cursor
 *  inside, and useCardSelectGesture's own INTERACTIVE_SELECTOR already excludes
 *  `button` from the Card's own tap-to-select gesture, so this can't be confused
 *  with either. */
export function PageLinkNodeView({ node, deleteNode }: NodeViewProps) {
  const ctx = useCardEditingContext();
  const pageId = node.attrs.pageId as string;
  // The stored `data-title` attr is a snapshot from whenever this link was last
  // inserted/resolved — never updated if the target Page is renamed afterward.
  // usePageTitle's live value (fetched/subscribed via pageTitleStore.ts) always
  // wins once known; the stale snapshot is only shown for the instant before that
  // first fetch resolves, so there's no flash of "Untitled" in the meantime.
  const staleTitle = node.attrs.title as string;
  const liveTitle = usePageTitle(pageId);
  const title = liveTitle !== undefined ? liveTitle : staleTitle;

  return (
    <NodeViewWrapper as="span" data-page-link-id={pageId} className="page-link-node">
      <button
        type="button"
        className="page-link-node__chip"
        contentEditable={false}
        onClick={(e) => {
          e.preventDefault();
          navigateToPageFromRichText(pageId);
        }}
      >
        {/* An untitled linked Page's data-title attr is "" — same "Untitled"
            fallback PageTitleHeader/PageBreadcrumb already use, so the chip is
            never a blank, unlabeled button (see App.tsx's blank-card report). */}
        {title || t("common.untitled")}
      </button>
      {ctx.editable && (
        <ElementControls variant="inline" label={t("card.deletePageLink")} onDelete={() => deleteNode()} />
      )}
    </NodeViewWrapper>
  );
}

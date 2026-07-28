import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { Icon } from "../../primitives/index.js";
import { t } from "../../../i18n/index.js";
import type { TranslationKey } from "../../../i18n/index.js";
import "./CalloutNode.css";

const CALLOUT_LABEL_KEYS: Record<string, TranslationKey> = {
  note: "callout.note",
  tip: "callout.tip",
  important: "callout.important",
  warning: "callout.warning",
  danger: "callout.danger",
};

/** The `callout` node's (richText/calloutNode.ts) React NodeView — the fold toggle
 *  button lives here (NodeView-only chrome, not part of the stored content), same
 *  split Card.tsx's own caret/collapsed state uses. `NodeViewContent` stays mounted
 *  even while collapsed (just hidden via CSS) — ProseMirror expects its contentDOM
 *  to always exist, same reasoning FileView.tsx's fullscreen overlay doesn't
 *  unmount its target. */
export function CalloutNodeView({ node, updateAttributes }: NodeViewProps) {
  const kind = (node.attrs.kind as string) ?? "note";
  const collapsed = !!node.attrs.collapsed;
  const labelKey = CALLOUT_LABEL_KEYS[kind] ?? "callout.note";

  return (
    <NodeViewWrapper className={`callout callout--${kind}`} data-callout={kind}>
      <button
        type="button"
        className="callout__toggle"
        contentEditable={false}
        onClick={() => updateAttributes({ collapsed: !collapsed })}
      >
        <Icon name="down" className={`callout__caret${collapsed ? " callout__caret--collapsed" : ""}`} />
        <span className="callout__label">{t(labelKey)}</span>
      </button>
      <NodeViewContent className={`callout__body${collapsed ? " callout__body--hidden" : ""}`} />
    </NodeViewWrapper>
  );
}

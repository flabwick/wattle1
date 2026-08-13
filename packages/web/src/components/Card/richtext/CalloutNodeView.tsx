import { useRef, useState } from "react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import type { CalloutKind } from "@wattle/shared";
import { Icon } from "../../primitives/index.js";
import { useCardEditingContext } from "./CardEditingContext.js";
import { CalloutKindPicker } from "./CalloutKindPicker.js";
import { ElementControls } from "./ElementControls.js";
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
export function CalloutNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const ctx = useCardEditingContext();
  const kind = (node.attrs.kind as string) ?? "note";
  const collapsed = !!node.attrs.collapsed;
  const labelKey = CALLOUT_LABEL_KEYS[kind] ?? "callout.note";
  const [kindPickerOpen, setKindPickerOpen] = useState(false);
  const kindButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <NodeViewWrapper className={`callout callout--${kind}`} data-callout={kind}>
      <div className="callout__header">
        <button
          type="button"
          className="callout__toggle"
          contentEditable={false}
          // A top-level Card's content area now bubbles a plain click up to select
          // the Card (CardRichText.tsx) — this button's own fold/unfold action
          // shouldn't also toggle that every time.
          onClick={(e) => {
            e.stopPropagation();
            updateAttributes({ collapsed: !collapsed });
          }}
        >
          <Icon name="down" className={`callout__caret${collapsed ? " callout__caret--collapsed" : ""}`} />
          <span className="callout__label">{t(labelKey)}</span>
        </button>
        {ctx.editable && (
          <div className="callout__kind-wrap">
            <button
              ref={kindButtonRef}
              type="button"
              className="callout__kind-btn"
              contentEditable={false}
              aria-label={t("callout.changeKind")}
              title={t("callout.changeKind")}
              onClick={(e) => {
                e.stopPropagation();
                setKindPickerOpen((open) => !open);
              }}
            >
              <Icon name="settings" />
            </button>
            {kindPickerOpen && (
              <CalloutKindPicker
                excludeSelector=".callout__kind-btn"
                style={(() => {
                  const rect = kindButtonRef.current?.getBoundingClientRect();
                  return rect ? { left: rect.left, top: rect.bottom + 4 } : {};
                })()}
                onSelect={(next: CalloutKind) => {
                  updateAttributes({ kind: next });
                  setKindPickerOpen(false);
                }}
                onClose={() => setKindPickerOpen(false)}
              />
            )}
          </div>
        )}
      </div>
      <NodeViewContent className={`callout__body${collapsed ? " callout__body--hidden" : ""}`} />
      {ctx.editable && (
        <ElementControls variant="corner" label={t("callout.delete")} onDelete={() => deleteNode()} />
      )}
    </NodeViewWrapper>
  );
}

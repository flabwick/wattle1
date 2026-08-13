import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { useCardEditingContext } from "./CardEditingContext.js";
import { ElementControls } from "./ElementControls.js";
import { t } from "../../../i18n/index.js";
import "./ImageNode.css";

/** The React NodeView for the base `image` node (@tiptap/extension-image, unchanged
 *  schema) — adds only the same ElementControls delete button every other rich-text
 *  element now has; native click-to-select-then-backspace still works too, this
 *  just makes removal discoverable without it. */
export function ImageNodeView({ node, deleteNode }: NodeViewProps) {
  const ctx = useCardEditingContext();
  const src = node.attrs.src as string;
  const alt = (node.attrs.alt as string) ?? "";
  const title = node.attrs.title as string | undefined;

  return (
    <NodeViewWrapper as="span" className="image-node">
      <img src={src} alt={alt} title={title} />
      {ctx.editable && (
        <ElementControls variant="corner" label={t("card.deleteImage")} onDelete={() => deleteNode()} />
      )}
    </NodeViewWrapper>
  );
}

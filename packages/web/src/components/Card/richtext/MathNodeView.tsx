import { useState } from "react";
import type { MouseEvent } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import katex from "katex";
import { InputField } from "../../primitives/index.js";
import { useCardEditingContext } from "./CardEditingContext.js";
import { ElementControls } from "./ElementControls.js";
import { t } from "../../../i18n/index.js";
import "katex/dist/katex.min.css";
import "./MathNode.css";

/** Inline (`$…$`) and block (`$$…$$`) math (richText/mathNode.ts) share this one
 *  NodeView — both are atoms storing raw LaTeX in `attrs.latex`, rendered via
 *  KaTeX. Click the rendered output to swap in a plain text input; Enter or
 *  clicking away commits it, Escape discards the edit. A freshly-inserted node
 *  (empty latex) starts straight in editing mode instead of rendering an empty
 *  KaTeX box first. */
export function MathNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const ctx = useCardEditingContext();
  const isBlock = node.type.name === "mathBlock";
  const latex = (node.attrs.latex as string) ?? "";
  const [editing, setEditing] = useState(latex.trim() === "");
  const [draft, setDraft] = useState(latex);

  function commit() {
    updateAttributes({ latex: draft });
    setEditing(false);
  }

  if (editing) {
    return (
      <NodeViewWrapper
        as={isBlock ? "div" : "span"}
        className={`math-node math-node--editing${isBlock ? " math-node--block" : ""}`}
      >
        <InputField
          className="math-node__input"
          value={draft}
          placeholder={t("card.mathPlaceholder")}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setDraft(latex);
              setEditing(false);
            }
          }}
        />
      </NodeViewWrapper>
    );
  }

  const html = katex.renderToString(latex, { throwOnError: false, displayMode: isBlock });

  return (
    <NodeViewWrapper
      as={isBlock ? "div" : "span"}
      className={`math-node-wrap${isBlock ? " math-node-wrap--block" : ""}`}
    >
      <span
        className={`math-node${isBlock ? " math-node--block" : ""}${selected ? " math-node--selected" : ""}`}
        // A top-level Card's content area now bubbles a plain click up to select the
        // Card (CardRichText.tsx) — clicking into this node's own LaTeX editing
        // shouldn't also toggle that.
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          setDraft(latex);
          setEditing(true);
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {ctx.editable && <ElementControls variant="inline" label={t("card.deleteMath")} onDelete={() => deleteNode()} />}
    </NodeViewWrapper>
  );
}

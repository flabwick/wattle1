import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { flattenToPlainText } from "@wattle/shared";
import { Icon } from "../primitives/index.js";
import { HIGHLIGHT_COLORS, highlightColorValue } from "../../lib/highlightColors.js";
import { t } from "../../i18n/index.js";
import "./SelectionMenu.css";

/** First plain-text index whose ProseMirror doc position is >= `docPos` — the
 *  reverse of flattenToPlainText's own charDocPos[textIndex] -> doc position
 *  mapping. A linear scan, not a binary search: Card content is small, and
 *  charDocPos is only non-decreasing (a block separator's two "\n" characters
 *  legitimately share one position), which a naive binary search would need extra
 *  care to handle correctly anyway. */
function plainTextIndexForDocPos(charDocPos: readonly number[], docPos: number): number {
  for (let i = 0; i < charDocPos.length; i++) {
    if (charDocPos[i] >= docPos) return i;
  }
  return charDocPos.length;
}

interface SelectionMenuProps {
  /** The Card content element this menu watches selections inside of — a selection
   *  that isn't fully contained in this node (e.g. it spans into a nested embed, or
   *  is elsewhere on the page entirely) is ignored, so each Card's own menu only ever
   *  reacts to a selection genuinely inside its own text. */
  containerRef: RefObject<HTMLElement>;
  /** The same TipTap instance CardRichText.tsx renders — used to translate the raw
   *  DOM selection (still native browser Selection/Range, since this menu only shows
   *  in read mode where the ProseMirror view itself isn't editable — see
   *  CardRichText.tsx) into the exact plain-text substring findAnchorRange will
   *  later resolve server-side (richText/plainText.ts), rather than raw
   *  `selection.toString()`: a selection spanning two paragraphs has no separator in
   *  the DOM/native-selection text, while flattenToPlainText inserts "\n\n" between
   *  blocks — without this, that anchor would never match server-side. */
  editor: Editor | null;
  /** Diff/footnote scoped to the selected text — calls the AI process, same as the
   *  Dock's whole-card run but anchored to just this span (see annotationService.ts's
   *  `selection` parameter). */
  onRunProcess: (process: "diff" | "footnote", text: string) => void;
  /** Highlight is manual here (no model call) — confirmed with the user: the span is
   *  already exactly delimited, so a color is all that's needed. */
  onCreateManualHighlight: (text: string, color: string) => void;
}

interface MenuState {
  text: string;
  top: number;
  left: number;
}

/**
 * The floating context menu shown when the user selects a span of text inside a Card
 * (spec: "show a small context menu at the selection with the same process icon used
 * in the Dock action"). Positioned at the selection's own bounding rect, dismissed on
 * any further selection change, click-away, or Escape.
 */
export function SelectionMenu({ containerRef, editor, onRunProcess, onCreateManualHighlight }: SelectionMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  useEffect(() => {
    function handleSelectionChange() {
      const selection = document.getSelection();
      const container = containerRef.current;
      if (!selection || selection.isCollapsed || !container || !editor) {
        setMenu(null);
        setColorPickerOpen(false);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setMenu(null);
        setColorPickerOpen(false);
        return;
      }
      // Not selection.toString(): a selection spanning two paragraphs has no
      // separator there, while flattenToPlainText inserts "\n\n" between blocks —
      // this maps the DOM range to ProseMirror positions first, then slices the
      // *same* flattened plain text findAnchorRange resolves anchors against, so a
      // multi-paragraph highlight/diff/footnote anchor still matches server-side.
      const from = editor.view.posAtDOM(range.startContainer, range.startOffset);
      const to = editor.view.posAtDOM(range.endContainer, range.endOffset);
      const { text: flattened, charDocPos } = flattenToPlainText(editor.state.doc);
      const text = flattened.slice(
        plainTextIndexForDocPos(charDocPos, from),
        plainTextIndexForDocPos(charDocPos, to),
      );
      if (!text.trim()) {
        setMenu(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      // TEMP DEBUG — remove once diagnosed.
      console.debug("[annot] SelectionMenu showing for selection:", JSON.stringify(text));
      setMenu({ text, top: rect.top, left: rect.left + rect.width / 2 });
      setColorPickerOpen(false);
    }

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [containerRef, editor]);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element;
      if (!target.closest(".selection-menu")) {
        setMenu(null);
        setColorPickerOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  if (!menu) return null;

  function dismiss() {
    setMenu(null);
    setColorPickerOpen(false);
    document.getSelection()?.removeAllRanges();
  }

  // Portaled to document.body rather than rendered in place: this mounts inside a
  // <p> (AnnotatedText.tsx), and a <div> isn't valid HTML inside a <p> — the browser
  // would otherwise silently split the paragraph in two around it. position: fixed
  // above already makes it visually independent of where it sits in the tree, so the
  // portal has no positioning side effects, only fixes the nesting.
  return createPortal(
    <div
      className="selection-menu"
      style={{ top: menu.top, left: menu.left }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {colorPickerOpen ? (
        <div className="selection-menu__colors">
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className="selection-menu__swatch"
              style={{ background: highlightColorValue(color) }}
              aria-label={color}
              title={color}
              onClick={() => {
                console.debug("[annot] SelectionMenu highlight color picked:", color, JSON.stringify(menu.text));
                onCreateManualHighlight(menu.text, color);
                dismiss();
              }}
            />
          ))}
        </div>
      ) : (
        <div className="selection-menu__actions">
          <button
            type="button"
            className="selection-menu__action"
            aria-label={t("selectionMenu.diff")}
            title={t("selectionMenu.diff")}
            onClick={() => {
              console.debug("[annot] SelectionMenu diff clicked:", JSON.stringify(menu.text));
              onRunProcess("diff", menu.text);
              dismiss();
            }}
          >
            <Icon name="diff" />
          </button>
          <button
            type="button"
            className="selection-menu__action"
            aria-label={t("selectionMenu.footnote")}
            title={t("selectionMenu.footnote")}
            onClick={() => {
              console.debug("[annot] SelectionMenu footnote clicked:", JSON.stringify(menu.text));
              onRunProcess("footnote", menu.text);
              dismiss();
            }}
          >
            <Icon name="footnote" />
          </button>
          <button
            type="button"
            className="selection-menu__action"
            aria-label={t("selectionMenu.highlight")}
            title={t("selectionMenu.highlight")}
            onClick={() => {
              console.debug("[annot] SelectionMenu highlight clicked, opening color picker");
              setColorPickerOpen(true);
            }}
          >
            <Icon name="highlight" />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

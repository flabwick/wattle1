import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { flattenToPlainText } from "@wattle/shared";
import { Icon } from "../primitives/index.js";
import { addQuote } from "../../lib/quotesRegistry.js";
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
  /** Which Card this selection is inside — addQuote below needs it. */
  cardId: string;
}

interface MenuState {
  text: string;
  top: number;
  left: number;
}

/**
 * The floating context menu shown when the user selects a span of text inside a Card
 * — three actions: copy the selection to the clipboard, turn it into a Quote
 * (quotation-mark icon, same quotesRegistry.ts the Dock's own "Quote" row action
 * commits to — see step17-multi-select-and-quotes.md), or dismiss. Positioned at the
 * selection's own bounding rect, dismissed on any further selection change,
 * click-away, or Escape. The diff/footnote/highlight annotation actions this menu
 * used to offer are gone — the Dock's own "process" action (ProcessPicker) still
 * runs those against a whole selected Card; this menu was their only
 * selection-scoped trigger.
 */
export function SelectionMenu({ containerRef, editor, cardId }: SelectionMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Briefly swaps the copy button's icon to a checkmark as feedback — cleared
  // whenever the selection itself changes, not just on a timer, so it never reads
  // "copied" against a since-changed selection.
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handleSelectionChange() {
      const selection = document.getSelection();
      const container = containerRef.current;
      if (!selection || selection.isCollapsed || !container || !editor) {
        setMenu(null);
        setCopied(false);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setMenu(null);
        return;
      }
      // Not selection.toString(): a selection spanning two paragraphs has no
      // separator there, while flattenToPlainText inserts "\n\n" between blocks —
      // this maps the DOM range to ProseMirror positions first, then slices the
      // *same* flattened plain text findAnchorRange resolves anchors against, so a
      // multi-paragraph Quote still matches server-side if it's ever needed there.
      let text: string;
      try {
        const from = editor.view.posAtDOM(range.startContainer, range.startOffset);
        const to = editor.view.posAtDOM(range.endContainer, range.endOffset);
        const { text: flattened, charDocPos } = flattenToPlainText(editor.state.doc);
        text = flattened.slice(
          plainTextIndexForDocPos(charDocPos, from),
          plainTextIndexForDocPos(charDocPos, to),
        );
      } catch {
        // posAtDOM can throw if the DOM hasn't settled against ProseMirror's own
        // model yet — the case that actually hits this is a Card whose editor just
        // mounted a moment ago (e.g. a hidden Card just switched on via "reveal
        // hidden cards"), unlike an always-visible Card whose editor has been
        // stable the whole session. Falls back to the raw selection string rather
        // than losing the menu entirely — Copy/Quote only need plain text, not the
        // block-separator-aware mapping multi-paragraph anchoring wants.
        text = selection.toString();
      }
      if (!text.trim()) {
        setMenu(null);
        setCopied(false);
        return;
      }
      const rect = range.getBoundingClientRect();
      setMenu({ text, top: rect.top, left: rect.left + rect.width / 2 });
      setCopied(false);
    }

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [containerRef, editor]);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element;
      if (!target.closest(".selection-menu")) {
        setMenu(null);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  if (!menu) return null;

  function dismiss() {
    setMenu(null);
    setCopied(false);
    document.getSelection()?.removeAllRanges();
  }

  // Arrow function, not a hoisted `function` declaration, so TypeScript's
  // narrowing of `menu` from the `if (!menu) return null;` check above still holds
  // inside it (a hoisted declaration's body is checked as if it could run before
  // that narrowing takes effect).
  const handleCopy = () => {
    navigator.clipboard
      .writeText(menu.text)
      .then(() => setCopied(true))
      .catch(() => {});
  };

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
      <div className="selection-menu__actions">
        <button
          type="button"
          className="selection-menu__action"
          aria-label={copied ? t("quickLookup.copied") : t("quickLookup.copy")}
          title={copied ? t("quickLookup.copied") : t("quickLookup.copy")}
          onClick={handleCopy}
        >
          <Icon name={copied ? "done" : "copy"} />
        </button>
        <button
          type="button"
          className="selection-menu__action"
          aria-label={t("quickLookup.addQuote")}
          title={t("quickLookup.addQuote")}
          onClick={() => {
            addQuote({ id: crypto.randomUUID(), cardId, text: menu.text });
            dismiss();
          }}
        >
          <Icon name="blockquote" />
        </button>
        <button
          type="button"
          className="selection-menu__action"
          aria-label={t("quickLookup.dismiss")}
          title={t("quickLookup.dismiss")}
          onClick={dismiss}
        >
          <Icon name="close" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

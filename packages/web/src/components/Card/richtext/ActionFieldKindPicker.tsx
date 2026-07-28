import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { ACTION_FIELD_KINDS } from "@wattle/shared";
import type { ActionFieldKind } from "@wattle/shared";
import { t } from "../../../i18n/index.js";
import type { TranslationKey } from "../../../i18n/index.js";
import "./ActionNodes.css";

const KIND_LABEL_KEYS: Record<ActionFieldKind, TranslationKey> = {
  text: "actionField.kind.text",
  textarea: "actionField.kind.textarea",
  number: "actionField.kind.number",
  slider: "actionField.kind.slider",
  toggle: "actionField.kind.toggle",
  select: "actionField.kind.select",
};

interface ActionFieldKindPickerProps {
  onSelect: (kind: ActionFieldKind) => void;
  onClose: () => void;
  /** Fixed viewport coordinates computed from the trigger button's own rect
   *  (Dock.tsx) — same reasoning as ProcessPicker.tsx/CardLinkPicker.tsx's own
   *  fixed positioning: .dock__row scrolls horizontally, which would clip a
   *  CSS-anchored (position: absolute) popover. This is the only place this opens
   *  from now, so there's no non-Dock variant to preserve. */
  style: CSSProperties;
  /** Excluded from the outside-click-to-close check, alongside this picker's own
   *  root — the Dock's trigger-button wrapper selector, so clicking it again while
   *  open just closes rather than closing-then-reopening. */
  excludeSelector: string;
}

/** The Dock's "insert field" action opens this instead of inserting directly —
 *  picks which of the fixed, flexible set of field kinds (richText/actionFieldNode.ts)
 *  to insert. Same outside-click/Escape-to-close convention as CardLinkPicker.tsx. */
export function ActionFieldKindPicker({ onSelect, onClose, style, excludeSelector }: ActionFieldKindPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element;
      if (rootRef.current && !rootRef.current.contains(target) && !target.closest(excludeSelector)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, excludeSelector]);

  return (
    <div ref={rootRef} className="action-field-kind-picker" style={style}>
      {ACTION_FIELD_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className="action-field-kind-picker__item"
          onClick={() => onSelect(kind)}
        >
          {t(KIND_LABEL_KEYS[kind])}
        </button>
      ))}
    </div>
  );
}

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { CALLOUT_KINDS } from "@wattle/shared";
import type { CalloutKind } from "@wattle/shared";
import { t } from "../../../i18n/index.js";
import type { TranslationKey } from "../../../i18n/index.js";
import "./ActionNodes.css";

const KIND_LABEL_KEYS: Record<CalloutKind, TranslationKey> = {
  note: "callout.note",
  tip: "callout.tip",
  important: "callout.important",
  warning: "callout.warning",
  danger: "callout.danger",
};

interface CalloutKindPickerProps {
  onSelect: (kind: CalloutKind) => void;
  onClose: () => void;
  /** Same fixed-position-from-trigger-rect convention as ActionFieldKindPicker.tsx. */
  style: CSSProperties;
  excludeSelector: string;
}

/** The Dock's "insert callout" action opens this instead of inserting directly —
 *  picks which of the five fixed callout kinds (richText/calloutNode.ts) to insert.
 *  Same outside-click/Escape-to-close convention as ActionFieldKindPicker.tsx. */
export function CalloutKindPicker({ onSelect, onClose, style, excludeSelector }: CalloutKindPickerProps) {
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
      {CALLOUT_KINDS.map((kind) => (
        <button key={kind} type="button" className="action-field-kind-picker__item" onClick={() => onSelect(kind)}>
          {t(KIND_LABEL_KEYS[kind])}
        </button>
      ))}
    </div>
  );
}

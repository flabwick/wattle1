import type { CSSProperties } from "react";
import { CALLOUT_KINDS } from "@wattle/shared";
import type { CalloutKind } from "@wattle/shared";
import { PopoverSurface } from "../../primitives/index.js";
import { useDismiss } from "../../../hooks/useDismiss.js";
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
  const rootRef = useDismiss<HTMLDivElement>(onClose, { excludeSelector });

  return (
    <PopoverSurface ref={rootRef} className="action-field-kind-picker" style={style}>
      {CALLOUT_KINDS.map((kind) => (
        <button key={kind} type="button" className="action-field-kind-picker__item" onClick={() => onSelect(kind)}>
          {t(KIND_LABEL_KEYS[kind])}
        </button>
      ))}
    </PopoverSurface>
  );
}

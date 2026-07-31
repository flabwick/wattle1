import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./ConvertPicker.css";

interface ConvertPickerProps {
  /** Same fixed-viewport-coordinates convention as ProcessPicker.tsx — computed from
   *  the trigger button's own rect rather than CSS-anchored, since the button sits
   *  inside .dock__row's horizontally-scrolling box. */
  style: CSSProperties;
  onPickStandardCard: () => void;
  onClose: () => void;
}

/** The Dock's Convert action opens this — pick which form to convert the current
 *  selection into. Standard Wattle Card (a plain Note) is the only working target
 *  today; every other Card type is a later stage of development. */
export function ConvertPicker({ style, onPickStandardCard, onClose }: ConvertPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element;
      if (rootRef.current && !rootRef.current.contains(target) && !target.closest(".dock__convert-wrap")) {
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
  }, [onClose]);

  return (
    <div ref={rootRef} className="convert-picker" style={style}>
      <button type="button" className="convert-picker__item" onClick={onPickStandardCard}>
        <Icon name="convert" className="convert-picker__item-icon" />
        <span>{t("dock.convert.standardCard")}</span>
      </button>
    </div>
  );
}

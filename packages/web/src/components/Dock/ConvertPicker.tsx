import type { CSSProperties } from "react";
import { PopoverItem, PopoverSurface } from "../primitives/index.js";
import { useDismiss } from "../../hooks/useDismiss.js";
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
  const rootRef = useDismiss<HTMLDivElement>(onClose, { excludeSelector: ".dock__convert-wrap" });

  return (
    <PopoverSurface ref={rootRef} className="convert-picker" style={style}>
      <PopoverItem variant="menu" icon="convert" onClick={onPickStandardCard}>
        <span>{t("dock.convert.standardCard")}</span>
      </PopoverItem>
    </PopoverSurface>
  );
}

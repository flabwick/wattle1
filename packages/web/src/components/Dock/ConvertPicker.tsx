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
  /** "Split into Cards" (Dock.tsx's handleConvertToDividedCards) — an EPUB's own
   *  chapters or an HTML document's own top-level headings, each becoming its own
   *  Card. null (not just disabled) when the current selection isn't a single
   *  EPUB/HTML file Card — dividing only has a sensible per-source meaning, not a
   *  combined-selection one the way the standard-card convert does. */
  onPickDivide: (() => void) | null;
  onClose: () => void;
}

/** The Dock's Convert action opens this — pick which form to convert the current
 *  selection into. Standard Wattle Card (a plain Note) always works; Split into
 *  Cards only shows up when it's actually applicable (see onPickDivide above). */
export function ConvertPicker({ style, onPickStandardCard, onPickDivide, onClose }: ConvertPickerProps) {
  const rootRef = useDismiss<HTMLDivElement>(onClose, { excludeSelector: ".dock__convert-wrap" });

  return (
    <PopoverSurface ref={rootRef} className="convert-picker" style={style}>
      <PopoverItem variant="menu" icon="convert" onClick={onPickStandardCard}>
        <span>{t("dock.convert.standardCard")}</span>
      </PopoverItem>
      {onPickDivide && (
        <PopoverItem variant="menu" icon="stackAdd" onClick={onPickDivide}>
          <span>{t("dock.convert.divide")}</span>
        </PopoverItem>
      )}
    </PopoverSurface>
  );
}

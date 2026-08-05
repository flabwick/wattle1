import type { CSSProperties } from "react";
import type { AnnotationProcess } from "../../api/client.js";
import { PopoverItem, PopoverSurface } from "../primitives/index.js";
import { useDismiss } from "../../hooks/useDismiss.js";
import { t } from "../../i18n/index.js";
import "./ProcessPicker.css";

interface ProcessPickerProps {
  /** Fixed viewport coordinates computed from the trigger button's own rect
   *  (Dock.tsx) — not CSS-anchored via position:absolute, since the button sits
   *  inside .dock__row's horizontally-scrolling (overflow-x: auto) box, which clips
   *  an absolutely-positioned popover that escapes it upward even though it still
   *  mounts (same reasoning SelectionMenu.tsx's fixed positioning already follows). */
  style: CSSProperties;
  onPick: (process: AnnotationProcess) => void;
  onClose: () => void;
}

/** The Dock's "run a process" action opens this — pick which of diff/footnote/
 *  highlight to run against the whole selected Card (root + any nested Cards). */
export function ProcessPicker({ style, onPick, onClose }: ProcessPickerProps) {
  // Also excludes the trigger button itself (.dock__process-wrap, a sibling rather
  // than an ancestor since this renders outside .dock__row) — otherwise clicking it
  // again while open would close-then-reopen instead of just closing.
  const rootRef = useDismiss<HTMLDivElement>(onClose, { excludeSelector: ".dock__process-wrap" });

  return (
    <PopoverSurface ref={rootRef} className="process-picker" style={style}>
      <PopoverItem variant="menu" icon="diff" onClick={() => onPick("diff")}>
        <span>{t("dock.process.diff")}</span>
      </PopoverItem>
      <PopoverItem variant="menu" icon="footnote" onClick={() => onPick("footnote")}>
        <span>{t("dock.process.footnote")}</span>
      </PopoverItem>
      <PopoverItem variant="menu" icon="highlight" onClick={() => onPick("highlight")}>
        <span>{t("dock.process.highlight")}</span>
      </PopoverItem>
    </PopoverSurface>
  );
}

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { AnnotationProcess } from "../../api/client.js";
import { Icon } from "../primitives/index.js";
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
  const rootRef = useRef<HTMLDivElement>(null);

  // TEMP DEBUG — remove once diagnosed.
  console.debug("[annot] ProcessPicker rendered", { style });

  function pick(process: AnnotationProcess) {
    console.debug("[annot] ProcessPicker item clicked:", process);
    onPick(process);
  }

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element;
      // Also excludes the trigger button itself (.dock__process-wrap, now a sibling
      // rather than an ancestor since this renders outside .dock__row) — otherwise
      // clicking it again while open would close-then-reopen instead of just closing.
      if (rootRef.current && !rootRef.current.contains(target) && !target.closest(".dock__process-wrap")) {
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
    <div ref={rootRef} className="process-picker" style={style}>
      <button
        type="button"
        className="process-picker__item"
        onClick={() => pick("diff")}
      >
        <Icon name="diff" className="process-picker__item-icon" />
        <span>{t("dock.process.diff")}</span>
      </button>
      <button
        type="button"
        className="process-picker__item"
        onClick={() => pick("footnote")}
      >
        <Icon name="footnote" className="process-picker__item-icon" />
        <span>{t("dock.process.footnote")}</span>
      </button>
      <button
        type="button"
        className="process-picker__item"
        onClick={() => pick("highlight")}
      >
        <Icon name="highlight" className="process-picker__item-icon" />
        <span>{t("dock.process.highlight")}</span>
      </button>
    </div>
  );
}

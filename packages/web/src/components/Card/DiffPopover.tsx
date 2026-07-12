import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./DiffPopover.css";

interface DiffPopoverProps {
  /** Fixed viewport coordinates computed from the triggering span's own rect
   *  (AnnotatedText.tsx) — this portals to document.body (see the return below), so
   *  it can't rely on CSS position:absolute anchored to a DOM ancestor any more. */
  style: CSSProperties;
  original: string;
  replacement: string;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
}

/** Per-entry review for one pending diff suggestion — a tick (accept: applies the
 *  replacement to the Card's real content) and a cross (reject: deletes the
 *  suggestion outright, no trace kept) for that entry alone. The Dock's "accept all"
 *  batch control is separate (Dock.tsx), this is only the single-entry path. */
export function DiffPopover({ style, original, replacement, onAccept, onReject, onClose }: DiffPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
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

  // Portaled to document.body: this mounts inside a <span>/<mark> (AnnotatedText.tsx),
  // and a <div> isn't valid HTML inside those phrasing-content elements — the browser
  // would otherwise silently misparse the surrounding markup around it.
  return createPortal(
    <div ref={rootRef} className="diff-popover" style={style} onClick={(e) => e.stopPropagation()}>
      <div className="diff-popover__preview">
        <span className="diff-popover__original">{original}</span>
        <span className="diff-popover__replacement">{replacement}</span>
      </div>
      <div className="diff-popover__actions">
        <button
          type="button"
          className="diff-popover__reject"
          aria-label={t("annotation.diff.reject")}
          title={t("annotation.diff.reject")}
          onClick={onReject}
        >
          <Icon name="close" />
        </button>
        <button
          type="button"
          className="diff-popover__accept"
          aria-label={t("annotation.diff.accept")}
          title={t("annotation.diff.accept")}
          onClick={onAccept}
        >
          <Icon name="done" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, InputField } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./AnnotationDetail.css";

interface AnnotationDetailProps {
  /** Short header label ("Footnote"/"Highlight") — this renders as a proper overlay
   *  card now, not a small anchored popover, so it gets a real header row. */
  title: string;
  /** The exact Card text this annotation is anchored to, quoted above the note field
   *  — a highlight's own `text` is optional, so without this the overlay could open
   *  with nothing in it at all beyond an empty, placeholder-only textarea and no clue
   *  what it's even about. */
  anchor: string;
  text: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  /** X control — permanent removal, no separate reject state (spec: footnotes and
   *  highlights never require acceptance, removal is the only dismissal action). */
  onRemove: () => void;
  onClose: () => void;
}

/**
 * The overlay a footnote marker or a highlighted span opens — "text + X", identical
 * interaction for both per spec (footnote text is always present; a highlight's text
 * is optional, but clicking a highlight always opens this to view/add it). Rendered as
 * a centered card-like overlay (not a small anchored popover — that made the textarea
 * too cramped to comfortably read/edit longer footnote text) with a dismissible
 * backdrop, same visual language as the rest of the app's cards. Local controlled
 * state so typing doesn't fire a PATCH per keystroke; saved on blur and on close,
 * whichever comes first, only if the text actually changed.
 */
export function AnnotationDetail({
  title,
  anchor,
  text,
  placeholder,
  onChangeText,
  onRemove,
  onClose,
}: AnnotationDetailProps) {
  const [value, setValue] = useState(text);
  const savedRef = useRef(text);

  function commit() {
    if (value !== savedRef.current) {
      savedRef.current = value;
      onChangeText(value);
    }
  }

  function close() {
    commit();
    onClose();
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close() reads current
    // `value` via a ref/closure recreated each render; re-subscribing on every
    // keystroke would just thrash the listener for no behavioral difference.
  }, []);

  // Portaled to document.body: this mounts inside a <mark>/<sup> (AnnotatedText.tsx),
  // and a <div> isn't valid HTML inside those phrasing-content elements — the browser
  // would otherwise silently misparse the surrounding markup around it. Also lets the
  // backdrop genuinely cover the whole viewport regardless of where in the Card tree
  // this was triggered from.
  return createPortal(
    <div className="annotation-detail__backdrop" onClick={close}>
      <div className="annotation-detail" onClick={(e) => e.stopPropagation()}>
        <div className="annotation-detail__header">
          <span className="annotation-detail__title">{title}</span>
          <button
            type="button"
            className="annotation-detail__remove"
            aria-label={t("annotation.remove")}
            title={t("annotation.remove")}
            onClick={() => {
              onRemove();
              onClose();
            }}
          >
            <Icon name="close" />
          </button>
        </div>
        <blockquote className="annotation-detail__anchor">{anchor}</blockquote>
        <InputField
          multiline
          className="annotation-detail__text"
          value={value}
          placeholder={placeholder}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
        />
      </div>
    </div>,
    document.body,
  );
}

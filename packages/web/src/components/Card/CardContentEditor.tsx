import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { InputField } from "../primitives/index.js";
import { parseCardRefs } from "../../lib/parseCardRefs.js";
import type { ContentSegment } from "../../lib/parseCardRefs.js";
import { CardEmbed } from "./CardEmbed.js";
import { t } from "../../i18n/index.js";
import "./CardContentEditor.css";

export interface CardContentEditorHandle {
  /** Inserts `token` at the cursor position of whichever text segment was last
   *  focused, or at the end of the content if none has been yet — see Card.tsx's
   *  "insert card link" toolbar button. */
  insertToken: (token: string) => void;
}

interface CardContentEditorProps {
  content: string;
  onChangeContent: (next: string) => void;
  ancestorIds: ReadonlySet<string>;
  depth: number;
}

/** Guarantees there's always an editable (possibly empty) text segment before, between,
 *  and after every ref segment — parseCardRefs alone won't produce one, say, right
 *  after a `[[cardId]]` at the very end of content, which would otherwise leave nowhere
 *  to click to keep typing past the last embed. */
function withEditableGaps(segments: ContentSegment[]): ContentSegment[] {
  if (segments.length === 0) {
    return [{ type: "text", value: "", start: 0, end: 0 }];
  }
  const result: ContentSegment[] = [];
  if (segments[0].type === "ref") {
    result.push({ type: "text", value: "", start: 0, end: 0 });
  }
  segments.forEach((segment, i) => {
    result.push(segment);
    const next = segments[i + 1];
    if (segment.type === "ref" && (!next || next.type === "ref")) {
      result.push({ type: "text", value: "", start: segment.end, end: segment.end });
    }
  });
  return result;
}

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

interface EditableTextSegmentProps {
  value: string;
  placeholder?: string;
  registerRef: (el: HTMLTextAreaElement | null) => void;
  onChangeValue: (value: string) => void;
  onFocusInfo: (start: number, end: number) => void;
}

/** One gap of plain, directly-typeable text between/around embeds — an auto-growing
 *  textarea (no fixed height, no manual resize handle) so the Card itself grows to
 *  fit however much is typed, rather than scrolling inside a fixed box. */
function EditableTextSegment({
  value,
  placeholder,
  registerRef,
  onChangeValue,
  onFocusInfo,
}: EditableTextSegmentProps) {
  const elRef = useRef<HTMLTextAreaElement | null>(null);

  // Covers value changes that don't come from typing directly into *this* textarea —
  // initial mount (content loaded from the server already spanning several lines),
  // switching which Card is open, or a sibling segment's edit reflowing this one's
  // start/end offsets. Typing itself is handled synchronously in onChange below
  // instead of relying on this effect, since `value` is a controlled prop that only
  // updates once the draft round-trips through the API (see onChangeDraft/App.tsx) —
  // waiting for that would make the box visibly lag a beat behind every keystroke.
  useEffect(() => {
    autoGrow(elRef.current);
  }, [value]);

  return (
    <InputField
      multiline
      ref={(el) => {
        // multiline is always true here, so this is always a textarea — InputField's
        // ref type is a union because it's shared with the single-line <input> case.
        const textarea = el as HTMLTextAreaElement | null;
        elRef.current = textarea;
        registerRef(textarea);
      }}
      className="card__content-input"
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        autoGrow(e.target);
        onChangeValue(e.target.value);
      }}
      onSelect={(e) => {
        const el = e.target as HTMLTextAreaElement;
        onFocusInfo(el.selectionStart, el.selectionEnd);
      }}
    />
  );
}

/**
 * A Card's content while it (or an ancestor embedding it) is being edited — the
 * editable counterpart to CardContent.tsx's read-only render. Plain text still shows
 * as a single auto-growing textarea (unchanged from before embeds existed); a
 * `[[cardId]]` token instead renders as a live, directly-editable CardEmbed inline
 * (forceEditing) rather than the raw token text a plain textarea would otherwise show
 * — see Card.tsx's editing branch, which is what mounts this.
 */
export const CardContentEditor = forwardRef<CardContentEditorHandle, CardContentEditorProps>(
  function CardContentEditor({ content, onChangeContent, ancestorIds, depth }, ref) {
    const segments = withEditableGaps(parseCardRefs(content));
    const lastFocus = useRef<{ start: number; end: number; segStart: number; segEnd: number } | null>(null);
    const textareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
    const pendingFocusOffset = useRef<number | null>(null);

    useImperativeHandle(ref, () => ({
      insertToken(token: string) {
        const focus = lastFocus.current;
        const insertPos = focus ? focus.segStart + focus.start : content.length;
        const deleteEnd = focus ? focus.segStart + focus.end : content.length;
        const newContent = content.slice(0, insertPos) + token + content.slice(deleteEnd);
        pendingFocusOffset.current = insertPos + token.length;
        onChangeContent(newContent);
      },
    }));

    // After an insertToken-driven content change lands (which round-trips through the
    // owning Page/Card's own state, not just local state — see onChangeContent's
    // callers), refocus the gap immediately after what was just inserted so typing can
    // continue right where the user left off.
    useEffect(() => {
      if (pendingFocusOffset.current === null) return;
      const offset = pendingFocusOffset.current;
      pendingFocusOffset.current = null;
      const idx = segments.findIndex((s) => s.type === "text" && offset >= s.start && offset <= s.end);
      if (idx === -1) return;
      const el = textareaRefs.current.get(idx);
      const segment = segments[idx];
      if (!el || !segment) return;
      const posInSegment = offset - segment.start;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(posInSegment, posInSegment);
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content only;
      // segments/textareaRefs are recomputed from it each render.
    }, [content]);

    return (
      <>
        {segments.map((segment, i) =>
          segment.type === "text" ? (
            <EditableTextSegment
              key={i}
              value={segment.value}
              placeholder={segments.length === 1 ? t("card.contentPlaceholder") : undefined}
              registerRef={(el) => {
                if (el) textareaRefs.current.set(i, el);
                else textareaRefs.current.delete(i);
              }}
              onChangeValue={(value) => {
                onChangeContent(content.slice(0, segment.start) + value + content.slice(segment.end));
              }}
              onFocusInfo={(start, end) => {
                lastFocus.current = { start, end, segStart: segment.start, segEnd: segment.end };
              }}
            />
          ) : (
            <CardEmbed key={i} cardId={segment.cardId} ancestorIds={ancestorIds} depth={depth} forceEditing />
          ),
        )}
      </>
    );
  },
);

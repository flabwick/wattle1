import { useRef, useState } from "react";
import type { Annotation } from "@wattle/shared";
import type { AnnotationProcess } from "../../api/client.js";
import { resolveAnnotationLayout } from "../../lib/resolveAnnotationSpans.js";
import { highlightColorValue } from "../../lib/highlightColors.js";
import { AnnotationDetail } from "./AnnotationDetail.js";
import { DiffPopover } from "./DiffPopover.js";
import { SelectionMenu } from "./SelectionMenu.js";
import { t } from "../../i18n/index.js";
import "./AnnotatedText.css";

interface AnnotatedTextProps {
  /** The real Card id this exact text belongs to — a top-level Card's own id, or an
   *  embed's own id (never a parent's), so every annotation action below is scoped to
   *  the right Card even when this text sits several embeds deep. */
  cardId: string;
  text: string;
  annotations: readonly Annotation[];
  /** CardContent.tsx passes "card__preview" for the no-refs case (matching the plain
   *  `<p>` this replaces) or "card-content__text" for one text run between embeds —
   *  same two classes/margins that already existed before annotations, just applied
   *  through this component now instead of an inline `<p>`. */
  className?: string;
  /** Diff/footnote scoped to a text selection inside this block (SelectionMenu).
   *  Undefined `selectionText` means "run against the whole Card" — not used here
   *  (that path is the Dock's process action, App.tsx), only threaded through so the
   *  signature matches what CardEmbed/Card.tsx pass down unchanged. */
  onRunProcess?: (cardId: string, process: AnnotationProcess, selectionText?: string) => void;
  onCreateManualHighlight?: (cardId: string, anchor: string, color: string) => void;
  onAcceptDiff?: (cardId: string, annotationId: string) => void;
  onRemoveAnnotation?: (cardId: string, annotationId: string) => void;
  onUpdateAnnotationText?: (cardId: string, annotationId: string, text: string) => void;
}

/**
 * Renders one plain-text run of a Card's content with diff/highlight/footnote overlays
 * layered on top — CardContent.tsx's replacement for a bare `<p>{content}</p>` once
 * annotation callbacks are wired in. Overlaps render correctly:
 * resolveAnnotationSpans.ts flattens diff/highlight into non-overlapping runs first,
 * so a span that's both highlighted and diff-pending nests the diff's strike/insert
 * treatment inside the highlight's `<mark>`. The text-selection context menu
 * (SelectionMenu) is mounted here too, scoped to exactly this block of text.
 */
/** Fixed viewport coordinates just below the triggering element — every diff/
 *  footnote/highlight popover here portals to document.body (they mount inside
 *  inline elements like <mark>/<span>/<sup>, which can't legally contain a <div>),
 *  so each needs its own position computed from the DOMRect captured at click time
 *  rather than a CSS anchor against a DOM ancestor. */
function popoverStyle(rect: DOMRect): { position: "fixed"; top: number; left: number } {
  return { position: "fixed", top: rect.bottom + 4, left: rect.left };
}

export function AnnotatedText({
  cardId,
  text,
  annotations,
  className = "card__preview",
  onRunProcess,
  onCreateManualHighlight,
  onAcceptDiff,
  onRemoveAnnotation,
  onUpdateAnnotationText,
}: AnnotatedTextProps) {
  const [open, setOpen] = useState<{ id: string; rect: DOMRect } | null>(null);
  const containerRef = useRef<HTMLParagraphElement>(null);

  const selectionMenu = onRunProcess && onCreateManualHighlight && (
    <SelectionMenu
      containerRef={containerRef}
      onRunProcess={(process, selectionText) => onRunProcess(cardId, process, selectionText)}
      onCreateManualHighlight={(selectionText, color) => onCreateManualHighlight(cardId, selectionText, color)}
    />
  );

  if (annotations.length === 0) {
    return (
      <p ref={containerRef} className={className}>
        {text}
        {selectionMenu}
      </p>
    );
  }

  const { runs, footnotes } = resolveAnnotationLayout(text, annotations);
  const sortedFootnotes = [...footnotes].sort((a, b) => a.position - b.position);
  const footnoteNumber = new Map(sortedFootnotes.map((f, i) => [f.annotation.id, i + 1]));

  // TEMP DEBUG — remove once the annotation-run-doesn't-do-anything issue is
  // diagnosed. If this never logs for a Card you know has annotations, the
  // `annotations` prop isn't reaching this component (check Card.tsx/CardEmbed.tsx's
  // canonicalCard.metadata.annotations wiring); if it logs but no run has a
  // diff/highlight and no marker shows, the anchors aren't matching this exact text
  // (resolveAnnotationSpans.ts skips silently on a non-match, by design).
  console.debug("[annot] AnnotatedText rendering", {
    cardId,
    text,
    annotationCount: annotations.length,
    runs: runs.map((r) => ({ text: r.text, diff: r.diff?.id ?? null, highlight: r.highlight?.id ?? null })),
    footnotes: sortedFootnotes.map((f) => f.annotation.id),
  });

  return (
    <p ref={containerRef} className={className}>
      {runs.map((run) => {
        let node: JSX.Element = <>{run.text}</>;

        if (run.diff) {
          const diff = run.diff;
          node = (
            <span
              className="annot annot--diff"
              onClick={(e) => {
                e.stopPropagation();
                console.debug("[annot] diff span clicked", { cardId, annotationId: diff.id });
                setOpen({ id: diff.id, rect: e.currentTarget.getBoundingClientRect() });
              }}
            >
              {run.text}
              {open?.id === diff.id && onAcceptDiff && onRemoveAnnotation && (
                <DiffPopover
                  style={popoverStyle(open.rect)}
                  original={run.text}
                  replacement={diff.replacement}
                  onAccept={() => {
                    console.debug("[annot] DiffPopover accept clicked", { cardId, annotationId: diff.id });
                    onAcceptDiff(cardId, diff.id);
                    setOpen(null);
                  }}
                  onReject={() => {
                    console.debug("[annot] DiffPopover reject clicked", { cardId, annotationId: diff.id });
                    onRemoveAnnotation(cardId, diff.id);
                    setOpen(null);
                  }}
                  onClose={() => setOpen(null)}
                />
              )}
            </span>
          );
        }

        if (run.highlight) {
          const highlight = run.highlight;
          node = (
            <mark
              className="annot annot--highlight"
              style={{ background: highlightColorValue(highlight.color) }}
              onClick={(e) => {
                e.stopPropagation();
                console.debug("[annot] highlight mark clicked", { cardId, annotationId: highlight.id });
                setOpen({ id: highlight.id, rect: e.currentTarget.getBoundingClientRect() });
              }}
            >
              {node}
              {open?.id === highlight.id && onUpdateAnnotationText && onRemoveAnnotation && (
                <AnnotationDetail
                  title={t("annotation.highlight.title")}
                  anchor={highlight.anchor}
                  text={highlight.text ?? ""}
                  placeholder={t("annotation.highlight.placeholder")}
                  onChangeText={(next) => {
                    console.debug("[annot] highlight text changed", { cardId, annotationId: highlight.id, next });
                    onUpdateAnnotationText(cardId, highlight.id, next);
                  }}
                  onRemove={() => {
                    console.debug("[annot] highlight removed", { cardId, annotationId: highlight.id });
                    onRemoveAnnotation(cardId, highlight.id);
                  }}
                  onClose={() => setOpen(null)}
                />
              )}
            </mark>
          );
        }

        const markers = sortedFootnotes.filter((f) => f.position === run.end);

        return (
          <span key={run.start} className="annot-run">
            {node}
            {markers.map((marker) => (
              <span key={marker.annotation.id} className="annot-run">
                <sup
                  className="annot__footnote-marker"
                  role="button"
                  tabIndex={0}
                  aria-label={t("annotation.footnote.open")}
                  onClick={(e) => {
                    e.stopPropagation();
                    console.debug("[annot] footnote marker clicked", { cardId, annotationId: marker.annotation.id });
                    setOpen({ id: marker.annotation.id, rect: e.currentTarget.getBoundingClientRect() });
                  }}
                >
                  {footnoteNumber.get(marker.annotation.id)}
                </sup>
                {open?.id === marker.annotation.id && onUpdateAnnotationText && onRemoveAnnotation && (
                  <AnnotationDetail
                    title={t("annotation.footnote.title")}
                    anchor={marker.annotation.anchor}
                    text={marker.annotation.text}
                    placeholder={t("annotation.footnote.placeholder")}
                    onChangeText={(next) => {
                      console.debug("[annot] footnote text changed", {
                        cardId,
                        annotationId: marker.annotation.id,
                        next,
                      });
                      onUpdateAnnotationText(cardId, marker.annotation.id, next);
                    }}
                    onRemove={() => {
                      console.debug("[annot] footnote removed", { cardId, annotationId: marker.annotation.id });
                      onRemoveAnnotation(cardId, marker.annotation.id);
                    }}
                    onClose={() => setOpen(null)}
                  />
                )}
              </span>
            ))}
          </span>
        );
      })}
      {selectionMenu}
    </p>
  );
}

import type { Annotation } from "@wattle/shared";

type DiffAnnotation = Extract<Annotation, { type: "diff" }>;
type HighlightAnnotation = Extract<Annotation, { type: "highlight" }>;
type FootnoteAnnotation = Extract<Annotation, { type: "footnote" }>;

/** One contiguous, non-overlapping slice of a text segment, carrying whichever
 *  diff/highlight annotation (at most one of each — see resolveAnnotationLayout's doc
 *  comment on picking the first when several genuinely coincide) is active over it. */
export interface AnnotationRun {
  start: number;
  end: number;
  text: string;
  diff: DiffAnnotation | null;
  highlight: HighlightAnnotation | null;
}

/** A footnote's marker position — zero-width, rendered immediately after its anchor's
 *  end offset rather than as part of any run, since a footnote never visually marks
 *  the anchor text itself (spec: "purely additive"). */
export interface FootnoteMarker {
  position: number;
  annotation: FootnoteAnnotation;
}

export interface AnnotationLayout {
  /** Covers the whole input text, contiguous and non-overlapping (empty-length gaps —
   *  where two boundaries coincide — are dropped, so every run has real text). */
  runs: AnnotationRun[];
  footnotes: FootnoteMarker[];
}

/**
 * Locates each annotation's `anchor` inside one text segment (via `text.indexOf` —
 * first occurrence only, a documented limitation: if the same exact text appears more
 * than once in a segment, every annotation on it resolves to its first occurrence) and
 * flattens diff/highlight ranges into non-overlapping runs — the standard
 * interval-flattening a span that's simultaneously highlighted *and* carries a
 * pending diff needs (spec: "the rendering must support this"). An annotation whose
 * anchor isn't found in this particular text segment (e.g. it belongs to a different
 * segment, or spans across an embed's `[[cardId]]` token) is silently skipped, not an
 * error — consistent with every other "anchor doesn't match" case in this feature.
 */
export function resolveAnnotationLayout(text: string, annotations: readonly Annotation[]): AnnotationLayout {
  interface Range {
    start: number;
    end: number;
    annotation: DiffAnnotation | HighlightAnnotation;
  }
  const ranges: Range[] = [];
  const footnotes: FootnoteMarker[] = [];

  for (const annotation of annotations) {
    const start = text.indexOf(annotation.anchor);
    if (start === -1) continue;
    const end = start + annotation.anchor.length;
    if (annotation.type === "footnote") {
      footnotes.push({ position: end, annotation });
    } else {
      ranges.push({ start, end, annotation });
    }
  }

  if (ranges.length === 0 && footnotes.length === 0) {
    return { runs: text ? [{ start: 0, end: text.length, text, diff: null, highlight: null }] : [], footnotes };
  }

  // Footnote positions must be boundaries too, not just range starts/ends — a
  // footnote-only annotation (no diff/highlight anywhere in this text) would
  // otherwise never land on a run's own `end`, and its marker would silently never
  // render (its position sits *inside* the single full-text run, matching nothing).
  const boundaries = new Set<number>([0, text.length]);
  for (const range of ranges) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }
  for (const marker of footnotes) {
    boundaries.add(marker.position);
  }
  const sorted = [...boundaries].sort((a, b) => a - b);

  const runs: AnnotationRun[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start === end) continue;

    const active = ranges.filter((range) => range.start <= start && end <= range.end);
    const diff = (active.find((range) => range.annotation.type === "diff")?.annotation ?? null) as
      | DiffAnnotation
      | null;
    const highlight = (active.find((range) => range.annotation.type === "highlight")?.annotation ?? null) as
      | HighlightAnnotation
      | null;

    runs.push({ start, end, text: text.slice(start, end), diff, highlight });
  }

  return { runs, footnotes };
}

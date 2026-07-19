import type { Annotation } from "../registries/cardMetadata.js";

type DiffAnnotation = Extract<Annotation, { type: "diff" }>;
type HighlightAnnotation = Extract<Annotation, { type: "highlight" }>;
type FootnoteAnnotation = Extract<Annotation, { type: "footnote" }>;

/** One annotation already resolved to a position range (see richText/plainText.ts's
 *  findAnchorRange) — this module only flattens overlapping ranges, it doesn't do
 *  anchor lookup itself, so the same algorithm works whether positions came from a
 *  live ProseMirror doc (client) or a headlessly-parsed one (server, if ever
 *  needed there). */
export interface ResolvedAnnotation {
  annotation: Annotation;
  /** For a diff/highlight, the full matched range. For a footnote, only `end` is
   *  used (its marker renders at the anchor's end, never wrapping the anchor text
   *  itself — spec: "purely additive"). */
  start: number;
  end: number;
}

/** One contiguous, non-overlapping slice, carrying whichever diff/highlight
 *  annotation (at most one of each — see the doc comment on `flattenAnnotationLayout`
 *  for what happens when several genuinely coincide) is active over it. */
export interface AnnotationRun {
  start: number;
  end: number;
  diff: DiffAnnotation | null;
  highlight: HighlightAnnotation | null;
}

export interface FootnoteMarker {
  position: number;
  annotation: FootnoteAnnotation;
}

export interface AnnotationLayout {
  /** Covers the whole `[0, length)` input, contiguous and non-overlapping
   *  (empty-length gaps — where two boundaries coincide — are dropped). */
  runs: AnnotationRun[];
  footnotes: FootnoteMarker[];
}

/**
 * Flattens already-resolved diff/highlight ranges into non-overlapping runs — the
 * standard interval-flattening a span that's simultaneously highlighted *and*
 * carries a pending diff needs (spec: "the rendering must support this"). Relocated
 * from the web app's old resolveAnnotationSpans.ts unchanged in substance: this is
 * pure interval math, format-agnostic, so it's shared between the (removed)
 * plain-text renderer and the new ProseMirror decoration extension
 * (packages/web/src/components/Card/richtext/AnnotationDecorations.ts) without
 * re-deriving it.
 */
export function flattenAnnotationLayout(length: number, resolved: ResolvedAnnotation[]): AnnotationLayout {
  interface Range {
    start: number;
    end: number;
    annotation: DiffAnnotation | HighlightAnnotation;
  }
  const ranges: Range[] = [];
  const footnotes: FootnoteMarker[] = [];

  for (const { annotation, start, end } of resolved) {
    if (annotation.type === "footnote") {
      footnotes.push({ position: end, annotation });
    } else {
      ranges.push({ start, end, annotation });
    }
  }

  if (ranges.length === 0 && footnotes.length === 0) {
    return { runs: length > 0 ? [{ start: 0, end: length, diff: null, highlight: null }] : [], footnotes };
  }

  // Footnote positions must be boundaries too, not just range starts/ends — a
  // footnote-only annotation (no diff/highlight anywhere in this content) would
  // otherwise never land on a run's own `end`, and its marker would silently never
  // render (its position sits *inside* the single full-length run, matching nothing).
  const boundaries = new Set<number>([0, length]);
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

    runs.push({ start, end, diff, highlight });
  }

  return { runs, footnotes };
}

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Annotation } from "@wattle/shared";
import { findAnchorRange, flattenAnnotationLayout } from "@wattle/shared";
import type { ResolvedAnnotation } from "@wattle/shared";
import { highlightColorValue } from "../../../lib/highlightColors.js";

/** Exported so CardRichText.tsx can push a live `annotations` prop in via
 *  `tr.setMeta(annotationDecorationsKey, annotations)` — the standard ProseMirror
 *  pattern for feeding external (React) data into a decoration plugin, since a
 *  plugin's own state can only change in response to a transaction. */
export const annotationDecorationsKey = new PluginKey<PluginState>("annotationDecorations");

interface PluginState {
  annotations: readonly Annotation[];
  decorations: DecorationSet;
}

/**
 * Resolves every annotation's `anchor` against the *current* doc (findAnchorRange,
 * richText/plainText.ts) and turns the result into ProseMirror decorations — the
 * rich-text replacement for AnnotatedText.tsx's plain-text span rendering. Recomputed
 * from scratch on every relevant transaction rather than incrementally mapped: Card
 * content is small, so there's no perf reason to do the harder, more error-prone
 * incremental thing, and a fresh resolve is what stays correct when an edit changes
 * the anchor text itself (a mapped position would otherwise silently point at the
 * wrong text).
 *
 * Diff/highlight both become `Decoration.inline` at the flattened run's exact range;
 * unlike the old React version, no manual DOM-nesting is needed for a run that's
 * *both* diff and highlight — ProseMirror's decoration renderer nests overlapping
 * inline decorations on its own, so this just emits one decoration per active
 * type per run, diff last (rendered inside/on top of highlight) so a click on
 * diff+highlighted text resolves to the diff via the nearest-ancestor lookup
 * CardRichText.tsx's click handler does. flattenAnnotationLayout (relocated from the
 * old resolveAnnotationSpans.ts in Stage 1) still does the "pick one of each type
 * when several genuinely coincide" reduction — coordinate-space-agnostic, so it works
 * the same over ProseMirror doc positions as it did over plain-text offsets.
 */
function buildDecorations(doc: PMNode, annotations: readonly Annotation[]): DecorationSet {
  if (annotations.length === 0) return DecorationSet.empty;

  const resolved: ResolvedAnnotation[] = [];
  for (const annotation of annotations) {
    const range = findAnchorRange(doc, annotation.anchor);
    if (!range) continue;
    resolved.push({ annotation, start: range.from, end: range.to });
  }
  if (resolved.length === 0) return DecorationSet.empty;

  const { runs, footnotes } = flattenAnnotationLayout(doc.content.size, resolved);

  const decorations: Decoration[] = [];
  for (const run of runs) {
    if (run.highlight) {
      decorations.push(
        Decoration.inline(run.start, run.end, {
          nodeName: "mark",
          class: "annot annot--highlight",
          style: `background:${highlightColorValue(run.highlight.color)}`,
          "data-annotation-id": run.highlight.id,
        }),
      );
    }
    if (run.diff) {
      decorations.push(
        Decoration.inline(run.start, run.end, {
          nodeName: "span",
          class: "annot annot--diff",
          "data-annotation-id": run.diff.id,
        }),
      );
    }
  }

  // 1-based, in document order — footnotes no longer restart numbering per text
  // segment the way AnnotatedText.tsx's per-instance numbering used to (this now
  // renders the whole Card as one doc, not several segments split around embeds).
  const sortedFootnotes = [...footnotes].sort((a, b) => a.position - b.position);
  sortedFootnotes.forEach((marker, i) => {
    decorations.push(
      Decoration.widget(
        marker.position,
        () => {
          const sup = document.createElement("sup");
          sup.className = "annot__footnote-marker";
          sup.dataset.annotationId = marker.annotation.id;
          sup.setAttribute("role", "button");
          sup.tabIndex = 0;
          sup.textContent = String(i + 1);
          return sup;
        },
        { side: 1, key: marker.annotation.id },
      ),
    );
  });

  return DecorationSet.create(doc, decorations);
}

export const AnnotationDecorations = Extension.create({
  name: "annotationDecorations",

  addProseMirrorPlugins() {
    return [
      new Plugin<PluginState>({
        key: annotationDecorationsKey,
        state: {
          init: () => ({ annotations: [], decorations: DecorationSet.empty }),
          apply(tr, prev, _oldState, newState) {
            const meta = tr.getMeta(annotationDecorationsKey) as readonly Annotation[] | undefined;
            if (meta === undefined && !tr.docChanged) return prev;
            const annotations = meta ?? prev.annotations;
            return { annotations, decorations: buildDecorations(newState.doc, annotations) };
          },
        },
        props: {
          decorations(state) {
            return annotationDecorationsKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

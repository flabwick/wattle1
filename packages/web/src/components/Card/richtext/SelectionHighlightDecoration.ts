import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { findAnchorRange } from "@wattle/shared";

/** One Quote's worth of decoration input — CardRichText.tsx feeds every Quote whose
 *  `cardId` matches this Card in via `tr.setMeta(selectionHighlightKey, entries)`,
 *  same "external data into a ProseMirror plugin" pattern AnnotationDecorations.ts
 *  uses for the persisted `annotations` prop. `id` is stamped as `data-quote-id` on
 *  the rendered `<mark>` so a click can resolve back to which Quote
 *  (quotesRegistry.ts) to target (targetedQuoteRegistry.ts) — the Dock's own action
 *  row is what actually removes it. `targeted` gets its own modifier class so the
 *  one the Dock's "Deselect quote" button would act on reads visibly different from
 *  any others. */
export interface SelectionHighlightEntry {
  id: string;
  anchor: string;
  targeted: boolean;
}

export const selectionHighlightKey = new PluginKey<PluginState>("selectionHighlight");

interface PluginState {
  entries: readonly SelectionHighlightEntry[];
  decorations: DecorationSet;
}

/** A Kindle-style "you quoted this" overlay for the Dock's multi-select/prompt
 *  context (quotesRegistry.ts) — deliberately a *separate*, much simpler plugin from
 *  AnnotationDecorations.ts rather than folding into it: these are never persisted
 *  (plain in-memory state, gone on reload, same as selectedPageCardIds), never have a
 *  run-merging/footnote story to worry about, and need to render in *both* read and
 *  edit mode (unlike annotations, which hide while editing) since Cards can be
 *  selected either way now. Several entries can coexist within the same Card (more
 *  than one Quote taken from it), each its own independent decoration/anchor. */
function buildDecorations(doc: PMNode, entries: readonly SelectionHighlightEntry[]): DecorationSet {
  if (entries.length === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  for (const entry of entries) {
    const range = findAnchorRange(doc, entry.anchor);
    if (!range) continue;
    decorations.push(
      Decoration.inline(range.from, range.to, {
        nodeName: "mark",
        class: entry.targeted ? "selection-highlight selection-highlight--targeted" : "selection-highlight",
        "data-quote-id": entry.id,
      }),
    );
  }
  return DecorationSet.create(doc, decorations);
}

export const SelectionHighlightDecoration = Extension.create({
  name: "selectionHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<PluginState>({
        key: selectionHighlightKey,
        state: {
          init: () => ({ entries: [], decorations: DecorationSet.empty }),
          apply(tr, prev, _oldState, newState) {
            const meta = tr.getMeta(selectionHighlightKey) as readonly SelectionHighlightEntry[] | undefined;
            if (meta === undefined && !tr.docChanged) return prev;
            const entries = meta ?? prev.entries;
            return { entries, decorations: buildDecorations(newState.doc, entries) };
          },
        },
        props: {
          decorations(state) {
            return selectionHighlightKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

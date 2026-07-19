import { Node } from "@tiptap/core";

/**
 * A `[[cardId]]` reference, formalized as a real TipTap node instead of a bracket
 * token spliced into plain text — see CardEmbed.tsx (web), which already renders
 * this as its own block-level box (header/fold chrome) regardless of surrounding
 * text, so `group: "block"` matches what's actually on screen today rather than
 * introducing a new layout.
 *
 * The tag is `wattle-embed`, deliberately not `card-embed` or anything starting with
 * the literal substring "card": prompt-engine's cardBlockParser.ts matches its own
 * nesting syntax via `/<card\b[^>]*>|<\/card>/` — `\b` triggers on the hyphen in
 * "card-embed", which would collide with that parser. This schema-only definition
 * (no NodeView) is safe to use headlessly on the server; packages/web's own richtext
 * extensions.ts layers a React NodeView on top of this same node name.
 */
export const CardEmbedNode = Node.create({
  name: "cardEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      cardId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-card-id"),
        renderHTML: (attrs) => ({ "data-card-id": attrs.cardId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "wattle-embed" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["wattle-embed", HTMLAttributes];
  },
});

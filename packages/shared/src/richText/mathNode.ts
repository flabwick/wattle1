import { Node, mergeAttributes, nodeInputRule } from "@tiptap/core";

/**
 * Inline math (`$…$`) — an atom node storing raw LaTeX source as an attribute,
 * rendered via KaTeX in packages/web's NodeView (richtext/extensions.ts). Atom
 * (not editable as ProseMirror text content) since KaTeX needs the whole source
 * string at once, not a stream of text nodes — same "config lives in an attribute,
 * not content" shape actionField's node already uses. Schema-only definition here;
 * the KaTeX-rendering NodeView is client-only (katex.renderToString needs no DOM,
 * but there's no reason to pull the ~250KB katex bundle into the server process).
 */
export const MathInlineNode = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-latex") ?? "",
        renderHTML: (attrs) => ({ "data-latex": attrs.latex }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "wattle-math-inline" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["wattle-math-inline", mergeAttributes(HTMLAttributes)];
  },

  // Typing a closing "$" after "$some latex" converts it in place — mirrors
  // Obsidian's own inline-math typing shortcut. Excludes a bare "$$" (block math,
  // see MathBlockNode below) by requiring at least one non-`$`/newline character
  // between the delimiters.
  addInputRules() {
    return [
      nodeInputRule({
        find: /(?:^|\s)\$([^$\n]+)\$$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] }),
      }),
    ];
  },
});

/** Block math (`$$…$$` on its own line), the block-level counterpart to
 *  MathInlineNode above — same atom/attribute-holds-latex shape, just
 *  `group: "block"` instead of inline. */
export const MathBlockNode = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-latex") ?? "",
        renderHTML: (attrs) => ({ "data-latex": attrs.latex }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "wattle-math-block" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["wattle-math-block", mergeAttributes(HTMLAttributes)];
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /^\$\$([^$\n]+)\$\$$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] }),
      }),
    ];
  },
});

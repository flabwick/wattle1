import { Node, mergeAttributes } from "@tiptap/core";

export const CALLOUT_KINDS = ["note", "tip", "important", "warning", "danger"] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

/**
 * Obsidian-style callout (`> [!note]`, `[!warning]`, …) — the closest Wattle can get
 * without inventing a whole admonition-syntax parser: a titled, colored, foldable
 * block container holding arbitrary rich content, the same "block+ content" shape a
 * blockquote has, plus a `kind` (which of the five fixed styles) and `collapsed`
 * (fold state, same convention as Card.tsx's own caret-fold) attribute. The label/
 * icon shown per `kind` is NodeView-only chrome, not part of the stored content —
 * same split CardEmbedNode's header uses. Schema-only definition (no NodeView) —
 * safe to use headlessly on the server; packages/web's own richtext extensions.ts
 * layers a React NodeView (the fold toggle button) on top of this same node name.
 */
export const CalloutNode = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: "note" as CalloutKind,
        parseHTML: (el) => el.getAttribute("data-kind") ?? "note",
        renderHTML: (attrs) => ({ "data-kind": attrs.kind }),
      },
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-collapsed") === "true",
        renderHTML: (attrs) => ({ "data-collapsed": attrs.collapsed ? "true" : "false" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "wattle-callout" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["wattle-callout", mergeAttributes(HTMLAttributes), 0];
  },
});

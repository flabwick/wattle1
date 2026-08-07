import { Node, mergeAttributes } from "@tiptap/core";

/**
 * A Page -> Page navigation link (Pages + Links + Search rebuild's "Link" primitive)
 * — an inline atom, unlike `cardEmbed` (block): a Page link reads as a word inside a
 * sentence ("see [[Roadmap]] for details"), not its own boxed unit. `title` is a
 * cached label (the target Page's title at insert/last-resolve time) so the chip has
 * something to render without a round-trip on every keystroke elsewhere; the actual
 * navigation always resolves `pageId` fresh.
 *
 * Tag is `wattle-page-link`, mirroring cardEmbedNode.ts's `wattle-embed` naming (and
 * for the same reason avoiding a bare "card"/"page" prefix isn't required here, but
 * consistency keeps the two "reference" node families visually paired in stored
 * HTML). Schema-only (no NodeView) so it's safe to use headlessly on the server —
 * packages/web's own richtext extensions.ts layers a React NodeView on top.
 */
export const PageLinkNode = Node.create({
  name: "pageLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-page-id"),
        renderHTML: (attrs) => ({ "data-page-id": attrs.pageId }),
      },
      title: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-title") ?? el.textContent ?? "",
        renderHTML: (attrs) => ({ "data-title": attrs.title }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "wattle-page-link" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["wattle-page-link", mergeAttributes(HTMLAttributes), HTMLAttributes.title || "Untitled"];
  },
});

import { Node } from "@tiptap/core";

/**
 * An inline "action button" embeddable directly in a Card's rich content — buttons
 * and field placeholders mixed into any note's own prose. Runs a fixed job
 * allow-list (web's lib/actionJobs.ts) via a dispatcher threaded down from
 * Card.tsx. `jobParams` is stored as a JSON string (TipTap attrs are
 * string/primitive-only), parsed/serialized at the node-view boundary (web's
 * ActionButtonNodeView.tsx).
 *
 * Tag is `wattle-action`, following cardEmbedNode.ts's own "avoid the substring
 * 'card'" rule: prompt-engine's cardBlockParser.ts matches `<card\b[^>]*>`, and
 * `\b` would trigger on a hyphen in something like "card-action".
 */
export const ActionButtonNode = Node.create({
  name: "actionButton",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? "",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
      jobId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-job-id"),
        renderHTML: (attrs) => ({ "data-job-id": attrs.jobId }),
      },
      /** JSON-encoded — e.g. `{"instructions":"...","contextMode":"own"}`. */
      jobParams: {
        default: "{}",
        parseHTML: (el) => el.getAttribute("data-job-params") ?? "{}",
        renderHTML: (attrs) => ({ "data-job-params": attrs.jobParams }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "wattle-action" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["wattle-action", HTMLAttributes];
  },
});

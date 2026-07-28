import { Node } from "@tiptap/core";

/**
 * The fixed, explicitly-allowed set of embeddable field kinds (Apps feature
 * follow-up: "a good flexible list") — a plain single-line box, a multi-line box,
 * a numeric spinner, a numeric slider, an on/off toggle, and a fixed-choice
 * dropdown. Covers the common form-control shapes without trying to be a generic
 * form builder.
 */
export const ACTION_FIELD_KINDS = ["text", "textarea", "number", "slider", "toggle", "select"] as const;
export type ActionFieldKind = (typeof ACTION_FIELD_KINDS)[number];

/**
 * A generic, embeddable input field — replaces the earlier single-purpose
 * actionInputNode.ts (a plain text box only) with one node parameterized by
 * `kind`. Meant to be filled in by whoever is *using* the Card, not just whoever
 * configured it: its current value is local component state only (web's
 * ActionFieldNodeView.tsx), never persisted into the stored document — it
 * registers into CardEditingContext's per-card registry instead, so any
 * actionButton (actionButtonNode.ts) in the same Card can collect every field's
 * current value (always stringified, regardless of kind), in document order, at
 * click time. Everything here is therefore this field's *configuration*, not its
 * value: `label` (a toggle's own caption, or a short heading for any other kind),
 * `placeholder` (text/textarea/number/select's empty-state hint), `min`/`max`/
 * `step` (number/slider), `defaultValue` (number/slider/toggle's starting value),
 * and `options` (a JSON-encoded string array, select only).
 */
export const ActionFieldNode = Node.create({
  name: "actionField",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      kind: {
        default: "text",
        parseHTML: (el) => el.getAttribute("data-kind") ?? "text",
        renderHTML: (attrs) => ({ "data-kind": attrs.kind }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? "",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
      placeholder: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-placeholder") ?? "",
        renderHTML: (attrs) => ({ "data-placeholder": attrs.placeholder }),
      },
      min: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-min") ?? "",
        renderHTML: (attrs) => ({ "data-min": attrs.min }),
      },
      max: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-max") ?? "",
        renderHTML: (attrs) => ({ "data-max": attrs.max }),
      },
      step: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-step") ?? "",
        renderHTML: (attrs) => ({ "data-step": attrs.step }),
      },
      defaultValue: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-default-value") ?? "",
        renderHTML: (attrs) => ({ "data-default-value": attrs.defaultValue }),
      },
      /** JSON-encoded string[] — only meaningful for kind "select". */
      options: {
        default: "[]",
        parseHTML: (el) => el.getAttribute("data-options") ?? "[]",
        renderHTML: (attrs) => ({ "data-options": attrs.options }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "wattle-field" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["wattle-field", HTMLAttributes];
  },
});

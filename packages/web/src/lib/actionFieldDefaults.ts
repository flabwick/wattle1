import type { ActionFieldKind } from "@wattle/shared";
import { t } from "../i18n/index.js";

/** A freshly inserted actionField's starting attrs, per kind — sensible enough to
 *  use immediately (a slider you can already drag, a select with two placeholder
 *  options to rename) rather than needing every field configured before it's
 *  usable at all. Used by the Dock's "insert field" action (Dock.tsx) — every
 *  rich-text insert action lives in the Dock now, not a Card's own header. */
export function defaultActionFieldAttrs(kind: ActionFieldKind): Record<string, unknown> {
  switch (kind) {
    case "number":
      return { kind, placeholder: "", min: "", max: "", step: "1", defaultValue: "" };
    case "slider":
      return { kind, min: "0", max: "100", step: "1", defaultValue: "50" };
    case "toggle":
      return { kind, label: t("actionField.toggle.defaultLabel"), defaultValue: "false" };
    case "select":
      return {
        kind,
        options: JSON.stringify([t("actionField.select.option1"), t("actionField.select.option2")]),
        placeholder: "",
      };
    case "textarea":
      return { kind, placeholder: "" };
    case "text":
    default:
      return { kind: "text", placeholder: "" };
  }
}

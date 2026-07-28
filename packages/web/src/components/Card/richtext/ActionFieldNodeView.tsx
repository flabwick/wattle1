import { useEffect, useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import type { ActionFieldKind } from "@wattle/shared";
import { Icon, InputField } from "../../primitives/index.js";
import { useCardEditingContext } from "./CardEditingContext.js";
import { ActionFieldConfigPopover } from "./ActionFieldConfigPopover.js";
import { t } from "../../../i18n/index.js";
import "./ActionNodes.css";

function parseOptions(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : "[]");
    return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The React NodeView for the `actionField` node (richText/actionFieldNode.ts) — one
 * of a fixed, flexible set of embeddable field kinds (text/textarea/number/slider/
 * toggle/select), meant to be filled in by whoever's *using* the card, not just
 * whoever configured it. Its value is local component state only, never written
 * back into the stored document (see actionFieldNode.ts's doc comment) — instead it
 * registers/updates itself into CardEditingContext's per-card registry (always as a
 * string, regardless of kind) so any actionButton in the same card can collect
 * every field's current value, in document order, at click time. Always
 * interactive regardless of whether the surrounding card is in edit or view mode —
 * that's the whole point of a "fill me in" field.
 */
export function ActionFieldNodeView({ node, getPos, updateAttributes }: NodeViewProps) {
  const ctx = useCardEditingContext();
  const [configOpen, setConfigOpen] = useState(false);
  const kind = (node.attrs.kind as ActionFieldKind) || "text";
  const label = node.attrs.label as string;
  const placeholder = (node.attrs.placeholder as string) || t("actionCard.inputPlaceholder");
  const min = node.attrs.min as string;
  const max = node.attrs.max as string;
  const step = node.attrs.step as string;
  const defaultValue = node.attrs.defaultValue as string;
  const options = parseOptions(node.attrs.options);
  const [value, setValue] = useState<string>(() => {
    if (kind === "toggle") return node.attrs.defaultValue === "true" ? "true" : "false";
    if (kind === "select") return options[0] ?? "";
    return (node.attrs.defaultValue as string) || "";
  });

  useEffect(() => {
    const pos = getPos();
    if (pos === undefined) return;
    ctx.registerActionFieldValue?.(pos, value);
    return () => ctx.unregisterActionFieldValue?.(pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx/getPos are stable
    // for this NodeView's lifetime; only `value` changing should re-register.
  }, [value]);

  return (
    <NodeViewWrapper className={`action-field-node action-field-node--${kind}`} data-drag-handle={false}>
      {ctx.editable && (
        <div className="action-field-node__configure-wrap">
          <button
            type="button"
            className="action-field-node__configure-btn"
            aria-label={t("actionField.configure")}
            title={t("actionField.configure")}
            onClick={() => setConfigOpen((open) => !open)}
          >
            <Icon name="settings" />
          </button>
          {configOpen && (
            <ActionFieldConfigPopover
              kind={kind}
              label={label}
              placeholder={placeholder}
              min={min}
              max={max}
              step={step}
              defaultValue={defaultValue}
              options={options}
              onChange={({ options: nextOptions, ...rest }) =>
                updateAttributes({
                  ...rest,
                  ...(nextOptions !== undefined ? { options: JSON.stringify(nextOptions) } : {}),
                })
              }
              onClose={() => setConfigOpen(false)}
            />
          )}
        </div>
      )}
      {kind === "text" && (
        <InputField
          className="action-field-node__control"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      {kind === "textarea" && (
        <InputField
          multiline
          className="action-field-node__control"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      {kind === "number" && (
        <input
          type="number"
          className="action-field-node__control action-field-node__number"
          value={value}
          placeholder={placeholder}
          min={min || undefined}
          max={max || undefined}
          step={step || undefined}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      {kind === "slider" && (
        <div className="action-field-node__slider-row">
          <input
            type="range"
            className="action-field-node__control action-field-node__slider"
            value={value}
            min={min || "0"}
            max={max || "100"}
            step={step || "1"}
            onChange={(e) => setValue(e.target.value)}
          />
          <span className="action-field-node__slider-value">{value}</span>
        </div>
      )}
      {kind === "toggle" && (
        <label className="action-field-node__toggle-row">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => setValue(e.target.checked ? "true" : "false")}
          />
          {label || t("actionField.toggle.defaultLabel")}
        </label>
      )}
      {kind === "select" && (
        <select
          className="action-field-node__control"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          {options.length === 0 && <option value="">{t("actionField.select.empty")}</option>}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </NodeViewWrapper>
  );
}

import type { ActionFieldKind } from "@wattle/shared";
import { InputField, PopoverSurface } from "../../primitives/index.js";
import { useDismiss } from "../../../hooks/useDismiss.js";
import { t } from "../../../i18n/index.js";
import "./ActionNodes.css";

export interface ActionFieldConfig {
  label: string;
  placeholder: string;
  min: string;
  max: string;
  step: string;
  defaultValue: string;
  options: string[];
}

interface ActionFieldConfigPopoverProps extends ActionFieldConfig {
  kind: ActionFieldKind;
  onChange: (next: Partial<ActionFieldConfig>) => void;
  onClose: () => void;
}

/**
 * Calibrates one actionField node's kind-specific settings — this is the
 * "content of these things ... calibrated ... as placeholders" half of the Apps
 * feature follow-up: what the field's own control looks like (placeholder text,
 * numeric bounds, toggle caption, select's choices), as opposed to the value a
 * *user of* the Card later types/picks into it (that stays local, never here — see
 * ActionFieldNodeView.tsx). Same outside-click/Escape-to-close convention as
 * CardLinkPicker.tsx/ActionButtonConfigPopover.tsx. `options` is edited as one
 * choice per line rather than a repeatable add/remove list, to keep this compact.
 */
export function ActionFieldConfigPopover({
  kind,
  label,
  placeholder,
  min,
  max,
  step,
  defaultValue,
  options,
  onChange,
  onClose,
}: ActionFieldConfigPopoverProps) {
  const rootRef = useDismiss<HTMLDivElement>(onClose);

  return (
    <PopoverSurface ref={rootRef} className="action-field-popover" onClick={(e) => e.stopPropagation()}>
      {(kind === "text" || kind === "textarea" || kind === "number" || kind === "select") && (
        <InputField
          value={placeholder}
          placeholder={t("actionField.config.placeholderLabel")}
          autoFocus
          onChange={(e) => onChange({ placeholder: e.target.value })}
        />
      )}
      {(kind === "number" || kind === "slider") && (
        <div className="action-field-popover__row">
          <InputField
            value={min}
            placeholder={t("actionField.config.min")}
            onChange={(e) => onChange({ min: e.target.value })}
          />
          <InputField
            value={max}
            placeholder={t("actionField.config.max")}
            onChange={(e) => onChange({ max: e.target.value })}
          />
          <InputField
            value={step}
            placeholder={t("actionField.config.step")}
            onChange={(e) => onChange({ step: e.target.value })}
          />
        </div>
      )}
      {(kind === "number" || kind === "slider") && (
        <InputField
          value={defaultValue}
          placeholder={t("actionField.config.defaultValue")}
          onChange={(e) => onChange({ defaultValue: e.target.value })}
        />
      )}
      {kind === "toggle" && (
        <InputField
          value={label}
          placeholder={t("actionField.config.toggleLabel")}
          autoFocus
          onChange={(e) => onChange({ label: e.target.value })}
        />
      )}
      {kind === "select" && (
        <InputField
          multiline
          value={options.join("\n")}
          placeholder={t("actionField.config.optionsPlaceholder")}
          onChange={(e) => onChange({ options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) })}
        />
      )}
    </PopoverSurface>
  );
}

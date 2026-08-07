import { useEffect, useState } from "react";
import type { Template, PageCardWithCard } from "@wattle/shared";
import { stepRefValue, type ActionFieldSpec } from "../../../../lib/actionJobRegistry.js";
import { InputField, Button } from "../../../primitives/index.js";
import { EmbeddableTextField } from "./EmbeddableTextField.js";
import { PageLinkPicker } from "../../PageLinkPicker.js";
import { CardLinkPicker } from "../../CardLinkPicker.js";
import { listTemplates } from "../../../../api/client.js";
import { t } from "../../../../i18n/index.js";
import "./ActionStepFields.css";

interface ActionStepFieldsProps {
  /** Scopes EmbeddableTextField's own annotation/ancestor bookkeeping. */
  cardIdForEmbeds: string;
  fields: ActionFieldSpec[];
  jobParams: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** Every PageCard on the same Page — for "cardPicker" fields' own "pick a card on
   *  this page" selector. */
  pageSiblings: PageCardWithCard[];
  /** Filtered out of that selector — a job's own target is always a specific
   *  *other* card, never the button/step-list Card itself. */
  excludePageCardId: string;
  /** The button Card's own `metadata.properties` — offered as `{{name}}` tokens a
   *  "text"/"richtext" field can insert (resolveJobParams, actionJobRegistry.ts,
   *  substitutes them for that property's live value right before the step runs).
   *  Optional/defaults to none: only CardInfoPanel.tsx's own step rows have a Card
   *  in scope to draw these from — an inline actionButton's single-job popover
   *  (ActionJobFields.tsx) still resolves tokens fine at run time, it just doesn't
   *  offer the picker to insert one. */
  variables?: ReadonlyArray<{ key: string; value: string }>;
  /** Earlier steps (in the same button's step list) that produce a Card —
   *  createCard/copyExistingCard/linkExistingCard — offered as an extra option
   *  alongside a real picked card, on both "cardPicker" and "vaultCardPicker"
   *  fields: "use whatever Card step N creates" instead of a fixed id chosen ahead
   *  of time. Selecting one writes `stepRefValue(id)` (actionJobRegistry.ts's
   *  `step:<id>` sentinel) as the field's value; ActionCardView.tsx's runSteps
   *  resolves it to a real id right before that step actually runs. Optional/
   *  defaults to none — only CardInfoPanel.tsx's own step rows (which know every
   *  other step in the same list) have anything to offer here; an inline
   *  actionButton's single-job popover (ActionJobFields.tsx) never does, since it
   *  isn't part of any step list. */
  stepOptions?: ReadonlyArray<{ id: string; label: string }>;
}

/**
 * The one generic renderer every job's own `fields` spec (actionJobRegistry.ts)
 * turns into actual controls — this is what makes the registry "pluggable": a new
 * job means one new `register()` call there, not new JSX here. Used both by
 * ActionJobFields.tsx (an inline actionButton's single-job popover, and the
 * "action" CardType's per-step row in CardInfoPanel.tsx).
 *
 * "cardPicker" writes three jobParams keys per field (`{key}` the picked PageCard
 * id, `{key}CardId` the underlying Card id, `{key}Title` a cached label) — a few
 * jobs (removeCard/saveCard/deleteCard/moveCard) need the PageCard id itself since
 * they act on "this Card as it appears on this Page", so this only ever offers the
 * current Page's own siblings. "vaultCardPicker" is the broader counterpart for
 * jobs that act on a Card by id regardless of where it's placed (renameCard/
 * editCard/freezeCard/addTag/setProperty/hideCard, plus linkExistingCard/
 * copyExistingCard) — search-as-you-type across the whole vault (CardLinkPicker),
 * writing just two keys (`{key}` the Card id directly, `{key}Title` a cached
 * label), since there's no PageCard involved at all.
 */
export function ActionStepFields({
  cardIdForEmbeds,
  fields,
  jobParams,
  onChange,
  pageSiblings,
  excludePageCardId,
  variables = [],
  stepOptions = [],
}: ActionStepFieldsProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [openPagePickerKey, setOpenPagePickerKey] = useState<string | null>(null);
  const [openVaultPickerKey, setOpenVaultPickerKey] = useState<string | null>(null);

  useEffect(() => {
    if (!fields.some((f) => f.kind === "templatePicker")) return;
    listTemplates()
      .then(setTemplates)
      .catch(() => {});
  }, [fields]);

  const siblings = pageSiblings.filter((pc) => pc.id !== excludePageCardId);

  function set(key: string, value: unknown) {
    onChange({ ...jobParams, [key]: value });
  }

  /** Appends a `{{name}}` token to whatever's already in a text/richtext field —
   *  simplest possible "insert", no cursor-position tracking needed, still easy to
   *  drag the inserted token to wherever it actually belongs afterward. */
  function insertVariable(key: string, name: string) {
    set(key, `${(jobParams[key] as string) ?? ""}{{${name}}}`);
  }

  return (
    <>
      {fields.map((field) => {
        switch (field.kind) {
          case "text":
            return (
              <div key={field.key} className="action-step-fields__text-row">
                <InputField
                  value={(jobParams[field.key] as string) ?? ""}
                  placeholder={field.placeholder}
                  onChange={(e) => set(field.key, e.target.value)}
                />
                {variables.length > 0 && (
                  <VariablePicker variables={variables} onInsert={(name) => insertVariable(field.key, name)} />
                )}
              </div>
            );

          case "richtext":
            return (
              <div key={field.key} className="action-step-fields__richtext-row">
                <EmbeddableTextField
                  cardId={cardIdForEmbeds}
                  label={field.label}
                  value={(jobParams[field.key] as string) ?? ""}
                  placeholder={field.placeholder}
                  onChange={(next) => set(field.key, next)}
                />
                {variables.length > 0 && (
                  <VariablePicker variables={variables} onInsert={(name) => insertVariable(field.key, name)} />
                )}
              </div>
            );

          case "select":
            return (
              <select
                key={field.key}
                className="app-select"
                value={(jobParams[field.key] as string) ?? ""}
                onChange={(e) => set(field.key, e.target.value)}
              >
                {field.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            );

          case "templatePicker":
            return (
              <select
                key={field.key}
                className="app-select"
                value={(jobParams[field.key] as string) ?? ""}
                onChange={(e) => set(field.key, e.target.value)}
              >
                <option value="">{t("actionCard.selectTemplate")}</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            );

          case "cardPicker":
            return (
              <select
                key={field.key}
                className="app-select"
                value={(jobParams[field.key] as string) ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.startsWith("step:")) {
                    const ref = stepOptions.find((s) => stepRefValue(s.id) === value);
                    onChange({ ...jobParams, [field.key]: value, [`${field.key}Title`]: ref?.label ?? "" });
                    return;
                  }
                  const pc = siblings.find((s) => s.id === value);
                  onChange({
                    ...jobParams,
                    [field.key]: value,
                    [`${field.key}CardId`]: pc?.card.id ?? "",
                    [`${field.key}Title`]: pc?.card.title ?? "",
                  });
                }}
              >
                <option value="">{t("actionCard.selectCardOnPage")}</option>
                {siblings.map((pc) => (
                  <option key={pc.id} value={pc.id}>
                    {pc.card.title}
                  </option>
                ))}
                {stepOptions.length > 0 && (
                  <optgroup label={t("actionCard.fromEarlierSteps")}>
                    {stepOptions.map((s) => (
                      <option key={s.id} value={stepRefValue(s.id)}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            );

          case "vaultCardPicker": {
            const open = openVaultPickerKey === field.key;
            const currentValue = jobParams[field.key] as string | undefined;
            const isStepRef = typeof currentValue === "string" && currentValue.startsWith("step:");
            const label = (jobParams[`${field.key}Title`] as string) || t("actionCard.noCardSelected");
            return (
              <div key={field.key} className="action-step-fields__page-target">
                <span className="action-step-fields__page-target-label">{label}</span>
                <Button onClick={() => setOpenVaultPickerKey(open ? null : field.key)}>
                  {t("actionCard.pickCard")}
                </Button>
                {stepOptions.length > 0 && (
                  <select
                    className="app-select action-step-fields__step-ref-picker"
                    value={isStepRef ? currentValue : ""}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const ref = stepOptions.find((s) => s.id === e.target.value);
                      onChange({
                        ...jobParams,
                        [field.key]: stepRefValue(e.target.value),
                        [`${field.key}Title`]: ref?.label ?? "",
                      });
                    }}
                  >
                    <option value="">{t("actionCard.fromEarlierSteps")}</option>
                    {stepOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                )}
                {open && (
                  <CardLinkPicker
                    onSelect={(card) => {
                      onChange({ ...jobParams, [field.key]: card.id, [`${field.key}Title`]: card.title });
                      setOpenVaultPickerKey(null);
                    }}
                    onClose={() => setOpenVaultPickerKey(null)}
                  />
                )}
              </div>
            );
          }

          case "pagePicker": {
            const open = openPagePickerKey === field.key;
            const label = (jobParams[`${field.key}Title`] as string) || t("actionCard.noPageSelected");
            return (
              <div key={field.key} className="action-step-fields__page-target">
                <span className="action-step-fields__page-target-label">{label}</span>
                <Button onClick={() => setOpenPagePickerKey(open ? null : field.key)}>
                  {t("actionCard.pickPage")}
                </Button>
                {open && (
                  <PageLinkPicker
                    onSelect={(page) => {
                      onChange({ ...jobParams, [field.key]: page.id, [`${field.key}Title`]: page.title ?? "" });
                      setOpenPagePickerKey(null);
                    }}
                    onClose={() => setOpenPagePickerKey(null)}
                  />
                )}
              </div>
            );
          }
        }
      })}
    </>
  );
}

/** Picking a variable inserts its `{{name}}` token and immediately resets back to
 *  the placeholder — so a text field with several variables can have more than one
 *  inserted one at a time, same "select fires an action, doesn't hold a selection"
 *  convention CardInfoPanel.tsx's own "Add step…" picker uses. */
function VariablePicker({
  variables,
  onInsert,
}: {
  variables: ReadonlyArray<{ key: string; value: string }>;
  onInsert: (name: string) => void;
}) {
  return (
    <select
      className="action-step-fields__variable-picker app-select"
      value=""
      onChange={(e) => {
        if (e.target.value) onInsert(e.target.value);
      }}
    >
      <option value="">{t("actionCard.insertVariable")}</option>
      {variables.map((v) => (
        <option key={v.key} value={v.key}>
          {v.key}
        </option>
      ))}
    </select>
  );
}

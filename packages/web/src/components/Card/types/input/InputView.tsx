import { useState } from "react";
import { CardShell, InputField } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard } from "../../../../lib/cardStore.js";
import { CardHeaderStart } from "../../CardHeaderStart.js";
import { CardHeaderActions } from "../../CardHeaderActions.js";
import { CardFlippableBody } from "../../CardFlippableBody.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";
import "./InputCard.css";

const DEFAULT_INPUT = { kind: "text" as const, options: [], placeholder: undefined, value: [] as string[] };

/**
 * The "input" CardType's render — a question (the Card's own title, same
 * `link`/`pageLinks` convention) plus the actual, live, answerable widget: unlike
 * every other View in this app, this one is never read-only — there's no separate
 * "answer" step, tapping/typing here writes straight through via `editCard`, same
 * "no draft, no Save step" convention `PageLinksEditor.tsx` uses for its own array.
 * Configuring *which* widget (kind/options/placeholder) happens in InputEditor.tsx
 * instead, reached the normal way (double-tap/onRequestEdit) — this component only
 * ever reads that configuration, never writes it.
 */
export function InputView({
  pageCard,
  selected,
  onSelect,
  onRequestEdit,
  onRemove,
  onTurnIntoStack,
  onSendToDock,
}: CardTypeViewProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const input = canonicalCard.metadata.input ?? DEFAULT_INPUT;
  const options = input.options ?? [];
  const value = input.value ?? [];
  const [showingInfo, setShowingInfo] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  function setValue(next: string[]) {
    editCard(pageCard.card.id, { metadata: { ...canonicalCard.metadata, input: { ...input, value: next } } });
  }

  const single = value[0] ?? "";
  const datalistId = `inputCard__datalist-${pageCard.card.id}`;

  return (
    <CardShell selected={selected} onDoubleClick={onRequestEdit}>
      <div className="card__header" onClick={onSelect}>
        <CardHeaderStart title={canonicalCard.title} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />
        <CardHeaderActions
          onTurnIntoStack={onTurnIntoStack && (() => onTurnIntoStack(pageCard.id))}
          onSendToDock={onSendToDock && (() => onSendToDock(pageCard.id))}
          onRemove={() => onRemove?.(pageCard.id)}
          showingInfo={showingInfo}
          onToggleInfo={() => setShowingInfo((v) => !v)}
        />
      </div>
      {!collapsed && (
        <CardFlippableBody
          card={canonicalCard}
          showingInfo={showingInfo}
          onChangeTitle={(title) => editCard(pageCard.card.id, { title })}
        >
          <div
            className="inputCard__control"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {input.kind === "text" && (
              <InputField
                value={single}
                placeholder={input.placeholder}
                onChange={(e) => setValue(e.target.value ? [e.target.value] : [])}
              />
            )}
            {input.kind === "textarea" && (
              <InputField
                multiline
                value={single}
                placeholder={input.placeholder}
                onChange={(e) => setValue(e.target.value ? [e.target.value] : [])}
              />
            )}
            {input.kind === "number" && (
              <InputField
                type="number"
                value={single}
                placeholder={input.placeholder}
                onChange={(e) => setValue(e.target.value ? [e.target.value] : [])}
              />
            )}
            {input.kind === "checkbox" && (
              <label className="inputCard__checkboxRow">
                <input
                  type="checkbox"
                  checked={value.includes("true")}
                  onChange={(e) => setValue(e.target.checked ? ["true"] : [])}
                />
                {t("inputCard.checkboxLabel")}
              </label>
            )}
            {input.kind === "radio" &&
              (options.length === 0 ? (
                <p className="card__preview">{t("inputCard.empty")}</p>
              ) : (
                <div className="inputCard__optionList">
                  {options.map((opt) => (
                    <label key={opt.value} className="inputCard__optionRow">
                      <input
                        type="radio"
                        name={`inputCard__radio-${pageCard.card.id}`}
                        checked={single === opt.value}
                        onChange={() => setValue([opt.value])}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              ))}
            {input.kind === "dropdown" &&
              (options.length === 0 ? (
                <p className="card__preview">{t("inputCard.empty")}</p>
              ) : (
                <select
                  className="app-select"
                  value={single}
                  onChange={(e) => setValue(e.target.value ? [e.target.value] : [])}
                >
                  <option value="">{t("inputCard.choosePlaceholder")}</option>
                  {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ))}
            {input.kind === "multiSelect" &&
              (options.length === 0 ? (
                <p className="card__preview">{t("inputCard.empty")}</p>
              ) : (
                <div className="inputCard__optionList">
                  {options.map((opt) => (
                    <label key={opt.value} className="inputCard__optionRow">
                      <input
                        type="checkbox"
                        checked={value.includes(opt.value)}
                        onChange={(e) =>
                          setValue(
                            e.target.checked ? [...value, opt.value] : value.filter((v) => v !== opt.value),
                          )
                        }
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              ))}
            {input.kind === "combobox" &&
              (options.length === 0 ? (
                <p className="card__preview">{t("inputCard.empty")}</p>
              ) : (
                <>
                  <InputField
                    list={datalistId}
                    value={single}
                    placeholder={input.placeholder}
                    onChange={(e) => setValue(e.target.value ? [e.target.value] : [])}
                  />
                  <datalist id={datalistId}>
                    {options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </datalist>
                </>
              ))}
          </div>
        </CardFlippableBody>
      )}
    </CardShell>
  );
}

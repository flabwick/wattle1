import { useState } from "react";
import { Button, Icon, InputField } from "../../../primitives/index.js";
import type { CardTypeEditorProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard } from "../../../../lib/cardStore.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";
import "./InputCard.css";

const DEFAULT_INPUT = { kind: "text" as const, options: [], placeholder: undefined, value: [] as string[] };

const OPTION_KINDS = new Set(["radio", "dropdown", "multiSelect", "combobox"]);
const PLACEHOLDER_KINDS = new Set(["text", "textarea", "number", "combobox"]);

/**
 * The "input" CardType's editor — configures *which* widget InputView.tsx renders
 * (kind/options/placeholder), reached the normal way via onRequestEdit. Title input
 * plus options-list management follow `PageLinksEditor.tsx`'s exact "write straight
 * through via editCard, no draft, no separate Save step" convention.
 */
export function InputEditor({ pageCard }: CardTypeEditorProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const input = canonicalCard.metadata.input ?? DEFAULT_INPUT;
  const options = input.options ?? [];
  const [newOption, setNewOption] = useState("");

  function setInput(next: Partial<typeof input>) {
    editCard(pageCard.card.id, { metadata: { ...canonicalCard.metadata, input: { ...input, ...next } } });
  }

  function addOption() {
    const label = newOption.trim();
    if (!label || options.some((o) => o.value === label)) {
      setNewOption("");
      return;
    }
    setInput({ options: [...options, { value: label, label }] });
    setNewOption("");
  }

  function removeOption(value: string) {
    setInput({
      options: options.filter((o) => o.value !== value),
      value: (input.value ?? []).filter((v) => v !== value),
    });
  }

  const showsOptions = OPTION_KINDS.has(input.kind);
  const showsPlaceholder = PLACEHOLDER_KINDS.has(input.kind);

  return (
    <div className="card-shell card-shell--editing card-shell--selected">
      <InputField
        className="card__title-input"
        value={canonicalCard.title}
        placeholder={t("card.titlePlaceholder")}
        autoFocus
        onChange={(e) => editCard(pageCard.card.id, { title: e.target.value })}
      />
      <select
        className="app-select inputCard__kindSelect"
        value={input.kind}
        onChange={(e) => setInput({ kind: e.target.value as typeof input.kind })}
      >
        <option value="text">{t("inputCard.kind.text")}</option>
        <option value="textarea">{t("inputCard.kind.textarea")}</option>
        <option value="number">{t("inputCard.kind.number")}</option>
        <option value="checkbox">{t("inputCard.kind.checkbox")}</option>
        <option value="radio">{t("inputCard.kind.radio")}</option>
        <option value="dropdown">{t("inputCard.kind.dropdown")}</option>
        <option value="multiSelect">{t("inputCard.kind.multiSelect")}</option>
        <option value="combobox">{t("inputCard.kind.combobox")}</option>
      </select>
      {showsPlaceholder && (
        <InputField
          value={input.placeholder ?? ""}
          placeholder={t("inputCard.placeholderLabel")}
          onChange={(e) => setInput({ placeholder: e.target.value })}
        />
      )}
      {showsOptions && (
        <>
          <ul className="inputCard__list inputCard__list--editing">
            {options.map((opt) => (
              <li key={opt.value}>
                <span>{opt.label}</span>
                <Button
                  iconOnly
                  aria-label={t("inputCard.removeOption")}
                  title={t("inputCard.removeOption")}
                  onClick={() => removeOption(opt.value)}
                >
                  <Icon name="close" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="inputCard__add-wrap">
            <InputField
              value={newOption}
              placeholder={t("inputCard.optionPlaceholder")}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption();
                }
              }}
            />
            <Button onClick={addOption}>
              <Icon name="plus" />
              {t("inputCard.addOption")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

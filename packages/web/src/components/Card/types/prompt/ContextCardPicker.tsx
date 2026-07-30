import { useEffect, useState } from "react";
import type { Card } from "@wattle/shared";
import { Button, Icon, InputField } from "../../../primitives/index.js";
import { listCards } from "../../../../api/client.js";
import { t } from "../../../../i18n/index.js";
import "./ContextCardPicker.css";

interface ContextCardPickerProps {
  selectedIds: readonly string[];
  onToggle: (cardId: string) => void;
  onDone: () => void;
}

/**
 * The Prompt Card's context-settings popover uses this when its mode is "cards" — a
 * multi-select sibling of CardLinkPicker.tsx (same search-as-you-type list, same
 * vault-wide `listCards` search rather than scoping to the current Page/Tab, so any
 * Card can be picked as reference material), but a checkbox toggle instead of
 * select-and-close: picking several Cards is the whole point here, so the popover
 * stays open across multiple picks. Deliberately has no click-outside/Escape
 * dismissal of its own — it's always nested inside PromptCardBody's own
 * context-settings popover, which owns one shared dismiss boundary for both the mode
 * buttons and this list; a second, independent one here would fight it (clicking a
 * mode button sitting just outside this component's own root would otherwise close
 * this one instantly).
 */
export function ContextCardPicker({ selectedIds, onToggle, onDone }: ContextCardPickerProps) {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<Card[]>([]);

  useEffect(() => {
    const handle = setTimeout(() => {
      listCards(query || undefined).then(setCards).catch(() => setCards([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const selected = new Set(selectedIds);

  return (
    <div className="context-card-picker">
      <div className="context-card-picker__search-wrap">
        <Icon name="search" className="context-card-picker__search-icon" />
        <InputField
          className="context-card-picker__search"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("card.linkPicker.searchPlaceholder")}
        />
      </div>
      <ul className="context-card-picker__list">
        {cards.map((card) => (
          <li key={card.id}>
            <button
              type="button"
              className="context-card-picker__item"
              onClick={() => onToggle(card.id)}
            >
              <span
                className={`context-card-picker__checkbox${
                  selected.has(card.id) ? " context-card-picker__checkbox--checked" : ""
                }`}
                aria-hidden="true"
              >
                {selected.has(card.id) && <Icon name="done" />}
              </span>
              <span className="context-card-picker__item-title">{card.title || t("common.untitled")}</span>
            </button>
          </li>
        ))}
        {cards.length === 0 && <li className="context-card-picker__empty">{t("card.linkPicker.empty")}</li>}
      </ul>
      <div className="context-card-picker__footer">
        <span className="context-card-picker__count">{selectedIds.length} selected</span>
        <Button onClick={onDone}>{t("promptCard.context.done")}</Button>
      </div>
    </div>
  );
}

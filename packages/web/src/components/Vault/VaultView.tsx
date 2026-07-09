import { useState } from "react";
import type { Card } from "@wattle/shared";
import { Button, InputField } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./VaultView.css";

interface VaultViewProps {
  cards: Card[];
  query: string;
  onQueryChange: (q: string) => void;
  onCreateCard: (title: string, content: string) => void;
  onDeleteCard: (id: string) => void;
  /** Open a vault Card into the topmost Page, if one exists. */
  onOpenIntoTopPage: ((cardId: string) => void) | null;
}

/** The flat vault list + search (spec1.md Part 3 "Vault"). */
export function VaultView({
  cards,
  query,
  onQueryChange,
  onCreateCard,
  onDeleteCard,
  onOpenIntoTopPage,
}: VaultViewProps) {
  const [newTitle, setNewTitle] = useState("");

  return (
    <div className="vault">
      <InputField
        className="vault__search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t("vault.searchPlaceholder")}
      />

      <form
        className="vault__new"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newTitle.trim()) return;
          onCreateCard(newTitle.trim(), "");
          setNewTitle("");
        }}
      >
        <InputField
          className="vault__new-input"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={t("vault.newCardPlaceholder")}
        />
        <Button type="submit" variant="primary">
          {t("vault.create")}
        </Button>
      </form>

      <ul className="vault__list">
        {cards.map((card) => (
          <li key={card.id} className="vault__item">
            <div className="vault__item-body">
              <div className="vault__item-title">{card.title || t("common.untitled")}</div>
              <div className="vault__item-preview">{card.content.slice(0, 120)}</div>
            </div>
            <div className="vault__item-actions">
              {onOpenIntoTopPage && (
                <Button onClick={() => onOpenIntoTopPage(card.id)}>{t("vault.open")}</Button>
              )}
              <Button variant="danger" onClick={() => onDeleteCard(card.id)}>
                {t("vault.delete")}
              </Button>
            </div>
          </li>
        ))}
        {cards.length === 0 && <li className="vault__empty">{t("vault.empty")}</li>}
      </ul>
    </div>
  );
}

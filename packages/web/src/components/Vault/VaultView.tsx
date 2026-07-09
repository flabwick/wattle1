import type { Card } from "@wattle/shared";
import { Button, Icon, InputField } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./VaultView.css";

interface VaultViewProps {
  cards: Card[];
  query: string;
  onQueryChange: (q: string) => void;
  /**
   * Create a new blank Card directly on the current Page and open this panel back to
   * it — like an IDE's "new file": no title/content form, it just appears ready to
   * edit in place, the same as any other Card. Null (hides the action) if there's no
   * Page to open it into yet.
   */
  onCreateCard: (() => void) | null;
  onDeleteCard: (id: string) => void;
  /** Open an existing vault Card into the topmost Page, if one exists. */
  onOpenIntoTopPage: ((cardId: string) => void) | null;
}

/**
 * The flat vault list + search (spec1.md Part 3 "Vault"), styled as a compact file
 * list: a row is a filename, not a card — click it to open, no content preview.
 */
export function VaultView({
  cards,
  query,
  onQueryChange,
  onCreateCard,
  onDeleteCard,
  onOpenIntoTopPage,
}: VaultViewProps) {
  return (
    <div className="vault">
      <div className="vault__toolbar">
        <div className="vault__search-wrap">
          <Icon name="search" className="vault__search-icon" />
          <InputField
            className="vault__search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("vault.searchPlaceholder")}
          />
        </div>
        {onCreateCard && (
          <Button
            iconOnly
            variant="primary"
            aria-label={t("vault.create")}
            title={t("vault.create")}
            onClick={onCreateCard}
          >
            <Icon name="plus" />
          </Button>
        )}
      </div>

      <ul className="vault__list">
        {cards.map((card) => (
          <li key={card.id} className="vault__item">
            <button
              type="button"
              className="vault__item-open"
              disabled={!onOpenIntoTopPage}
              onClick={() => onOpenIntoTopPage?.(card.id)}
            >
              <Icon name="file" className="vault__item-icon" />
              <span className="vault__item-title">{card.title || t("common.untitled")}</span>
            </button>
            <Button
              iconOnly
              variant="danger"
              className="vault__item-delete"
              aria-label={t("vault.delete")}
              title={t("vault.delete")}
              onClick={() => onDeleteCard(card.id)}
            >
              <Icon name="delete" />
            </Button>
          </li>
        ))}
        {cards.length === 0 && <li className="vault__empty">{t("vault.empty")}</li>}
      </ul>
    </div>
  );
}

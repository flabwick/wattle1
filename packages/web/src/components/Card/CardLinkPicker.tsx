import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Card } from "@wattle/shared";
import { Icon, InputField } from "../primitives/index.js";
import { listCards } from "../../api/client.js";
import { t } from "../../i18n/index.js";
import "./CardLinkPicker.css";

interface CardLinkPickerProps {
  onSelect: (card: Card) => void;
  onClose: () => void;
  /** Overrides the default position:absolute anchoring with fixed viewport
   *  coordinates — needed when this opens from the Dock (Dock.tsx's "insert card
   *  link" action): .dock__row scrolls horizontally (overflow-x: auto), which
   *  clips an absolutely-positioned popover that escapes it upward even though it
   *  still mounts (same reasoning ProcessPicker.tsx's fixed positioning follows). */
  style?: CSSProperties;
  /** Also excluded from the outside-click-to-close check, alongside this picker's
   *  own root — set to the Dock's trigger-button wrapper selector so clicking it
   *  again while open just closes rather than closing-then-reopening (same
   *  reasoning as ProcessPicker's own trigger-button exclusion). */
  excludeSelector?: string;
}

/**
 * A small anchored popover for picking a Card to embed — same search-as-you-type
 * behaviour as VaultView/useVault, but a compact positioned list instead of a full
 * side panel, since this opens right next to (or, from the Dock, above) the cursor
 * it's inserting a card-link embed at.
 */
export function CardLinkPicker({ onSelect, onClose, style, excludeSelector }: CardLinkPickerProps) {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      listCards(query || undefined).then(setCards).catch(() => setCards([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        !(excludeSelector && target.closest(excludeSelector))
      ) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, excludeSelector]);

  return (
    <div ref={rootRef} className="card-link-picker" style={style}>
      <div className="card-link-picker__search-wrap">
        <Icon name="search" className="card-link-picker__search-icon" />
        <InputField
          className="card-link-picker__search"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("card.linkPicker.searchPlaceholder")}
        />
      </div>
      <ul className="card-link-picker__list">
        {cards.map((card) => (
          <li key={card.id}>
            <button
              type="button"
              className="card-link-picker__item"
              onClick={() => onSelect(card)}
            >
              <Icon name="file" className="card-link-picker__item-icon" />
              <span className="card-link-picker__item-title">
                {card.title || t("common.untitled")}
              </span>
            </button>
          </li>
        ))}
        {cards.length === 0 && (
          <li className="card-link-picker__empty">{t("card.linkPicker.empty")}</li>
        )}
      </ul>
    </div>
  );
}

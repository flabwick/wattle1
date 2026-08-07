import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Card } from "@wattle/shared";
import { PopoverItem, PopoverSearch, PopoverSurface } from "../primitives/index.js";
import { useDismiss } from "../../hooks/useDismiss.js";
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
  const rootRef = useDismiss<HTMLDivElement>(onClose, { excludeSelector });

  useEffect(() => {
    const handle = setTimeout(() => {
      listCards(query || undefined).then(setCards).catch(() => setCards([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <PopoverSurface ref={rootRef} className="card-link-picker" style={style}>
      <PopoverSearch
        value={query}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("card.linkPicker.searchPlaceholder")}
      />
      <ul className="card-link-picker__list">
        {cards.map((card) => (
          <li key={card.id}>
            <PopoverItem icon="file" onClick={() => onSelect(card)}>
              <span className="card-link-picker__item-title">{card.title}</span>
            </PopoverItem>
          </li>
        ))}
        {cards.length === 0 && (
          <li className="popover-empty">{t("card.linkPicker.empty")}</li>
        )}
      </ul>
    </PopoverSurface>
  );
}

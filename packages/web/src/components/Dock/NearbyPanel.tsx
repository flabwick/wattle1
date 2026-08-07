import type { NearbyItem } from "@wattle/shared";
import { t } from "../../i18n/index.js";
import "./NearbyPanel.css";

interface NearbyPanelProps {
  items: NearbyItem[];
  loading: boolean;
  onOpenCard: (cardId: string) => void;
}

/**
 * The Nearby panel (Wattle vault plan) — a short ranked list, re-scored on every
 * focus/typing change via useNearby.ts, rather than a fixed sidebar of "linked
 * notes". Tapping a row opens that Card onto the current Page, same "Open" action
 * VaultView.tsx's own card rows use.
 */
export function NearbyPanel({ items, loading, onOpenCard }: NearbyPanelProps) {
  if (!loading && items.length === 0) {
    return (
      <div className="nearby-panel">
        <p className="nearby-panel__empty">{t("dock.nearby.empty")}</p>
      </div>
    );
  }

  return (
    <div className="nearby-panel">
      {items.map((item) => (
        <button
          key={item.cardId}
          type="button"
          className="nearby-panel__item"
          onClick={() => onOpenCard(item.cardId)}
        >
          <span className="nearby-panel__item-title">{item.title}</span>
          {item.summary && item.summary !== item.title && (
            <span className="nearby-panel__item-summary">{item.summary}</span>
          )}
        </button>
      ))}
    </div>
  );
}

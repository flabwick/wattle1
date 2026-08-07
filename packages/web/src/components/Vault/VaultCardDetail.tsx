import type { Card, NearbyItem } from "@wattle/shared";
import { flattenToPlainText, htmlToDoc } from "@wattle/shared";
import { Icon } from "../primitives/index.js";
import type { VaultCardLink } from "../../hooks/useVaultCardDetail.js";
import { t } from "../../i18n/index.js";
import "./VaultCardDetail.css";

/** How much of a Card's content to show as a preview here — this is a browsing
 *  aid, not the actual editor (that's opening it onto a Page). */
const PREVIEW_CHARS = 240;

interface VaultCardDetailProps {
  card: Card;
  links: VaultCardLink[];
  nearbyItems: NearbyItem[];
  loading: boolean;
  onOpenCard: (cardId: string) => void;
  onBack: () => void;
}

/**
 * The Vault panel's click-through card view (Wattle vault plan): opening a Card from
 * the search list or a folder shows its content preview plus every Card it Links to
 * (embeds + metadata.links) and its durable Nearby list — click either to drill
 * straight into that Card's own detail view in turn, no separate navigation needed.
 * The Dock's own action row underneath still drives Add to Page/Rename/Move/Delete
 * for whichever Card is open here, same as it did for the old flat-list selection.
 */
export function VaultCardDetail({ card, links, nearbyItems, loading, onOpenCard, onBack }: VaultCardDetailProps) {
  const preview = flattenToPlainText(htmlToDoc(card.content)).text.trim();
  const truncated = preview.length > PREVIEW_CHARS ? `${preview.slice(0, PREVIEW_CHARS)}…` : preview;

  return (
    <div className="vault-card-detail">
      <button type="button" className="vault-card-detail__back" onClick={onBack}>
        <Icon name="back" />
        {t("vault.detail.back")}
      </button>

      <div className="vault-card-detail__header">
        <span className="vault-card-detail__title">{card.title}</span>
        {card.frozenAt && (
          <span className="vault-card-detail__frozen" title={t("card.frozen")} aria-label={t("card.frozen")}>
            <Icon name="lock" />
          </span>
        )}
      </div>

      {truncated && <p className="vault-card-detail__preview">{truncated}</p>}

      <section className="vault-card-detail__section">
        <h3 className="vault-card-detail__section-title">{t("vault.detail.links")}</h3>
        {links.length === 0 && !loading && (
          <p className="vault-card-detail__empty">{t("vault.detail.noLinks")}</p>
        )}
        <ul className="vault-card-detail__list">
          {links.map((link) => (
            <li key={link.cardId}>
              <button type="button" className="vault-card-detail__row" onClick={() => onOpenCard(link.cardId)}>
                <Icon name="link" className="vault-card-detail__row-icon" />
                <span>{link.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="vault-card-detail__section">
        <h3 className="vault-card-detail__section-title">{t("vault.detail.nearby")}</h3>
        {nearbyItems.length === 0 && !loading && (
          <p className="vault-card-detail__empty">{t("vault.detail.noNearby")}</p>
        )}
        <ul className="vault-card-detail__list">
          {nearbyItems.map((item) => (
            <li key={item.cardId}>
              <button type="button" className="vault-card-detail__row" onClick={() => onOpenCard(item.cardId)}>
                <Icon name="compass" className="vault-card-detail__row-icon" />
                <span className="vault-card-detail__row-title">{item.title}</span>
                {item.summary && item.summary !== item.title && (
                  <span className="vault-card-detail__row-summary">{item.summary}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

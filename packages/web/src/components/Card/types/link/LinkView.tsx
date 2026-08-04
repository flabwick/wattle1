import { CardShell, Icon } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";
import "./LinkCard.css";

/**
 * The "link" CardType's render — a title plus its bookmarked URL, opened in a new tab.
 * A tap elsewhere on the card toggles selection (same as every other type); tapping
 * the URL itself opens it externally instead, so bookmarking a link stays one click
 * away rather than needing Edit first.
 */
export function LinkView({ pageCard, selected, onSelect, onRequestEdit }: CardTypeViewProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const url = canonicalCard.metadata.link?.url ?? "";

  return (
    <CardShell selected={selected} onClick={onSelect} onDoubleClick={onRequestEdit}>
      <div className="card__header">
        <div className="card__header-start">
          <span className="card__title">{canonicalCard.title || t("card.titlePlaceholder")}</span>
        </div>
      </div>
      {url ? (
        <a
          className="linkCard__url"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="externalLink" />
          {url}
        </a>
      ) : (
        <p className="card__preview">{t("linkCard.noUrl")}</p>
      )}
    </CardShell>
  );
}

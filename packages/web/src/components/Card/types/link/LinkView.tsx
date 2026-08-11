import { useState } from "react";
import { CardShell, Icon } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard } from "../../../../lib/cardStore.js";
import { CardHeaderStart } from "../../CardHeaderStart.js";
import { CardHeaderActions } from "../../CardHeaderActions.js";
import { CardFlippableBody } from "../../CardFlippableBody.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";
import "./LinkCard.css";

/**
 * The "link" CardType's render — a title plus its bookmarked URL, opened in a new tab.
 * The header's own fold-caret/select-checkbox (CardHeaderStart) is the only way to
 * select now, same as every other type; tapping the URL itself opens it externally,
 * so bookmarking a link stays one click away rather than needing Edit first.
 */
export function LinkView({
  pageCard,
  selected,
  onSelect,
  onRequestEdit,
  onRemove,
  onTurnIntoStack,
}: CardTypeViewProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const url = canonicalCard.metadata.link?.url ?? "";
  const [showingInfo, setShowingInfo] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <CardShell selected={selected} onDoubleClick={onRequestEdit}>
      <div className="card__header" onClick={onSelect}>
        <CardHeaderStart title={canonicalCard.title} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />
        <CardHeaderActions
          onTurnIntoStack={onTurnIntoStack && (() => onTurnIntoStack(pageCard.id))}
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
        </CardFlippableBody>
      )}
    </CardShell>
  );
}

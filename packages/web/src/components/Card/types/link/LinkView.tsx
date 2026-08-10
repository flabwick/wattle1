import { useState } from "react";
import { CardShell, Icon } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
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
  onSave,
  onOpenInVault,
  onTurnIntoStack,
  onOpenFullscreen,
}: CardTypeViewProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const url = canonicalCard.metadata.link?.url ?? "";
  const [showingInfo, setShowingInfo] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const hasUnsavedChanges = pageCard.draftTitle !== null || pageCard.draftContent !== null || !pageCard.card.savedToVault;

  return (
    <CardShell selected={selected} onDoubleClick={onRequestEdit}>
      <div className="card__header">
        <CardHeaderStart
          title={canonicalCard.title}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
          selected={selected}
          onSelect={onSelect}
        />
        <CardHeaderActions
          hasUnsavedChanges={hasUnsavedChanges}
          onSave={() => onSave?.(pageCard.id)}
          onOpenInVault={() => onOpenInVault?.(canonicalCard.title)}
          onTurnIntoStack={onTurnIntoStack && (() => onTurnIntoStack(pageCard.id))}
          onOpenFullscreen={onOpenFullscreen && (() => onOpenFullscreen(pageCard.id))}
          showingInfo={showingInfo}
          onToggleInfo={() => setShowingInfo((v) => !v)}
        />
      </div>
      {!collapsed && (
        <CardFlippableBody card={canonicalCard} showingInfo={showingInfo}>
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

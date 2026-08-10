import { useState } from "react";
import { CardShell, Icon } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { navigateToPageFromRichText } from "../../../../lib/pageNavRegistry.js";
import { CardHeaderStart } from "../../CardHeaderStart.js";
import { CardHeaderActions } from "../../CardHeaderActions.js";
import { CardFlippableBody } from "../../CardFlippableBody.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";
import "./PageLinksCard.css";

/**
 * The "pageLinks" CardType's render — a title plus its list of Page navigation
 * targets, each one tappable straight to that Page (same navigateToPageFromRichText
 * registry a `pageLink` rich-text node's own click uses — see
 * richtext/PageLinkNodeView.tsx). Tapping a target stops propagation so it navigates
 * instead of just selecting the card, same convention LinkView's URL uses for opening
 * externally. The header's own fold-caret/select-checkbox (CardHeaderStart) is the
 * only way to select now, same as every other type.
 */
export function PageLinksView({
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
  const targets = canonicalCard.metadata.pageLinks?.targets ?? [];
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
          {targets.length === 0 ? (
            <p className="card__preview">{t("pageLinksCard.empty")}</p>
          ) : (
            <ul className="pageLinksCard__list">
              {targets.map((target) => (
                <li key={target.pageId}>
                  <button
                    type="button"
                    className="pageLinksCard__target"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateToPageFromRichText(target.pageId);
                    }}
                  >
                    <Icon name="pages" />
                    {target.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardFlippableBody>
      )}
    </CardShell>
  );
}

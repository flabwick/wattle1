import { useState } from "react";
import { CardShell } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { SearchCardBody } from "./SearchCardBody.js";
import { CardHeaderStart } from "../../CardHeaderStart.js";
import { CardHeaderActions } from "../../CardHeaderActions.js";
import { CardFlippableBody } from "../../CardFlippableBody.js";
import "../../Card.css";

/** The header's own fold-caret/select-checkbox (CardHeaderStart) is the only way to
 *  select now, same as every other type — everything else (Move, Hide, remove) is
 *  reached from the Dock. The search box/results inside (SearchCardBody) are
 *  independently always-interactive regardless of selection, same "content isn't
 *  gated behind edit mode" precedent PromptCardView.tsx/StackBody.tsx use; folding
 *  it away is a separate, orthogonal control (the caret). */
export function SearchCardView({
  pageCard,
  selected,
  onSelect,
  onSave,
  onOpenInVault,
  onTurnIntoStack,
  onOpenFullscreen,
}: CardTypeViewProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const [showingInfo, setShowingInfo] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const hasUnsavedChanges = pageCard.draftTitle !== null || pageCard.draftContent !== null || !pageCard.card.savedToVault;

  return (
    <CardShell selected={selected}>
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
          <SearchCardBody pageCard={pageCard} />
        </CardFlippableBody>
      )}
    </CardShell>
  );
}

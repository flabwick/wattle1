import { useState } from "react";
import { CardShell } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { PromptCardBody } from "./PromptCardBody.js";
import { useCard } from "../../../../hooks/useCard.js";
import { CardHeaderStart } from "../../CardHeaderStart.js";
import { CardHeaderActions } from "../../CardHeaderActions.js";
import { CardFlippableBody } from "../../CardFlippableBody.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";

/** The header's own fold-caret/select-checkbox (CardHeaderStart) is the only way to
 *  select now, same as every other type; Save/turn-into-stack/fullscreen/info live
 *  in the header's own CardHeaderActions row, everything else (Edit, Move, Hide,
 *  remove) is reached from the Dock. The input/Send/output inside (PromptCardBody)
 *  is independently always-interactive regardless of selection — same "content
 *  isn't gated behind edit mode" precedent StackBody.tsx uses; folding it away is a
 *  separate, orthogonal control (the caret), not tied to selection either. */
export function PromptCardView({
  pageCard,
  selected,
  onSelect,
  onOpenFullscreen,
  onSave,
  onOpenInVault,
  onTurnIntoStack,
}: CardTypeViewProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  // Same "reveal hidden Cards" toggle Card.tsx's own "note" branch honors — shown
  // only while PageStack.tsx's revealHidden is on (see PageCardSlot), so this class
  // is always the "still hidden" indicator, never a false positive.
  const isHidden = Boolean(pageCard.card.metadata.hidden);
  const [showingInfo, setShowingInfo] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const hasUnsavedChanges = pageCard.draftTitle !== null || pageCard.draftContent !== null || !pageCard.card.savedToVault;
  return (
    <CardShell selected={selected} className={isHidden ? "card-shell--hidden" : undefined}>
      <div className="card__header">
        <CardHeaderStart
          title={t("promptCard.title")}
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
          <PromptCardBody pageCard={pageCard} />
        </CardFlippableBody>
      )}
    </CardShell>
  );
}

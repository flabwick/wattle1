import { useState } from "react";
import { CardShell } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard } from "../../../../lib/cardStore.js";
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
  onRemove,
  onTurnIntoStack,
  onSendToDock,
}: CardTypeViewProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const [showingInfo, setShowingInfo] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <CardShell selected={selected}>
      <div className="card__header" onClick={onSelect}>
        <CardHeaderStart title={canonicalCard.title} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />
        <CardHeaderActions
          onTurnIntoStack={onTurnIntoStack && (() => onTurnIntoStack(pageCard.id))}
          onSendToDock={onSendToDock && (() => onSendToDock(pageCard.id))}
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
          <SearchCardBody pageCard={pageCard} />
        </CardFlippableBody>
      )}
    </CardShell>
  );
}

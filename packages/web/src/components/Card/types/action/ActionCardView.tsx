import { useState } from "react";
import { Badge, Button, CardShell, Icon } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard } from "../../../../lib/cardStore.js";
import { CardHeaderStart } from "../../CardHeaderStart.js";
import { CardHeaderActions } from "../../CardHeaderActions.js";
import { CardFlippableBody } from "../../CardFlippableBody.js";
import { runActionSteps } from "../../../../lib/actionJobRegistry.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";
import "./ActionCard.css";

/**
 * The "action" CardType's render — the whole-card counterpart to an inline
 * actionButton node (richText/actionButtonNode.ts): the entire card *is* one
 * calibrated button, running its ordered list of steps in sequence. Configuration
 * (which steps, in what order, their own parameters) lives entirely on the card's
 * own flip/info panel now (CardInfoPanel.tsx's "Actions" section) — there's no more
 * inline gear-button editor; flipping the card is the only way to change what it
 * does. The header's own fold-caret/select-checkbox (CardHeaderStart) is the only
 * way to select now, same as every other type; Save/turn-into-stack/fullscreen/info
 * live in the header's own CardHeaderActions row, everything else (Move, Hide,
 * remove) is reached from the Dock.
 */
export function ActionCardView({
  pageCard,
  selected,
  onSelect,
  onRunActionJob,
  generatingPageCardId,
  pageSiblings,
  onRemove,
  onTurnIntoStack,
  onSendToDock,
}: CardTypeViewProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const action = canonicalCard.metadata.action;
  const steps = action?.steps ?? [];
  const label = action?.label || t("actionCard.defaultLabel");
  const configured = steps.length > 0;
  const [showingInfo, setShowingInfo] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const isRunning = running || generatingPageCardId === pageCard.id;
  // Same "reveal hidden Cards" toggle Card.tsx's own "note" branch honors — shown
  // only while PageStack.tsx's revealHidden is on (see PageCardSlot), so this class
  // is always the "still hidden" indicator, never a false positive.
  const isHidden = Boolean(canonicalCard.metadata.hidden);

  /** Runs every step in order, stopping at the first failure so a partial run is
   *  never mistaken for a complete one — the actual loop (step-to-step reference
   *  resolution, stop-on-error) is shared with the "guide the next generation"
   *  auto-run pipeline (App.tsx) via actionJobRegistry.ts's runActionSteps; this is
   *  just the button's own thin wrapper around it, translating the result into
   *  local UI state. Only the *first* failing step's own error shows (not a full
   *  per-step list) — this is a button, not a console; the flip panel's own step
   *  list is where you'd go to see/fix which step broke. */
  async function runSteps() {
    if (!onRunActionJob) return;
    setRunning(true);
    setRunError(null);
    const result = await runActionSteps(pageCard, steps, onRunActionJob);
    if (result.error) setRunError(result.error);
    setRunning(false);
  }

  return (
    <CardShell selected={selected} className={isHidden ? "card-shell--hidden" : undefined}>
      <div className="card__header" onClick={onSelect}>
        <CardHeaderStart title={t("actionCard.pickerTileLabel")} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)}>
          {!configured && <Badge>{t("actionCard.job.none")}</Badge>}
        </CardHeaderStart>
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
          pageSiblings={pageSiblings}
          excludePageCardId={pageCard.id}
          onChangeTitle={(title) => editCard(pageCard.card.id, { title })}
        >
          <Button
            className="action-card__run"
            disabled={!configured || isRunning}
            onClick={(e) => {
              e.stopPropagation();
              if (configured) void runSteps();
            }}
          >
            <Icon name="generate" spin={isRunning} />
            {label}
          </Button>
          {runError && <p className="action-card__run-error">{runError}</p>}
        </CardFlippableBody>
      )}
    </CardShell>
  );
}

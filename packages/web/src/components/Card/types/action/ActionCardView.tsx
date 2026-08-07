import { useState } from "react";
import { Badge, Button, CardShell, Icon } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { CardHeaderActions } from "../../CardHeaderActions.js";
import { CardFlippableBody } from "../../CardFlippableBody.js";
import { actionJobRegistry, resolveStepReferences, type StepOutput } from "../../../../lib/actionJobRegistry.js";
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
 * does. A tap elsewhere on the card toggles selection (App.tsx's
 * toggleSelectPageCard) — in if not already selected, out again if it was;
 * Save/turn-into-stack/fullscreen/info live in the header's own CardHeaderActions
 * row, everything else (Move, Hide, remove) is reached from the Dock.
 */
export function ActionCardView({
  pageCard,
  selected,
  onSelect,
  onOpenFullscreen,
  onRunActionJob,
  generatingPageCardId,
  pageSiblings,
  onSave,
  onOpenInVault,
  onTurnIntoStack,
}: CardTypeViewProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const action = canonicalCard.metadata.action;
  const steps = action?.steps ?? [];
  const label = action?.label || t("actionCard.defaultLabel");
  const configured = steps.length > 0;
  const [showingInfo, setShowingInfo] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const isRunning = running || generatingPageCardId === pageCard.id;
  const hasUnsavedChanges = pageCard.draftTitle !== null || pageCard.draftContent !== null || !pageCard.card.savedToVault;
  // Same "reveal hidden Cards" toggle Card.tsx's own "note" branch honors — shown
  // only while PageStack.tsx's revealHidden is on (see PageCardSlot), so this class
  // is always the "still hidden" indicator, never a false positive.
  const isHidden = Boolean(canonicalCard.metadata.hidden);

  /** Runs every step in order, awaiting each via the (now-awaitable, see
   *  cardTypeUi.ts's own doc comment on this prop) onRunActionJob prop — stopping
   *  at the first failure so a partial run is never mistaken for a complete one,
   *  same "stop and report" behavior the "operation" CardType this replaced had.
   *  Only the *first* failing step's own error shows (not a full per-step list) —
   *  this is a button, not a console; the flip panel's own step list is where you'd
   *  go to see/fix which step broke.
   *
   *  `stepOutputs` is this run's own scratch space for step-to-step references
   *  (actionJobRegistry.ts's StepOutput/resolveStepReferences — the flip panel's
   *  own "or use step N's card" pickers, ActionStepFields.tsx) — each card-creating
   *  step's own result is recorded here right after it runs, so a *later* step's
   *  `step:<id>` reference resolves to a real id by the time it's dispatched. Never
   *  persisted: a fresh Map every run, since a step's produced Card is a new one
   *  each time, not a stable id the button remembers between runs. */
  async function runSteps() {
    if (!onRunActionJob) return;
    setRunning(true);
    setRunError(null);
    const stepOutputs = new Map<string, StepOutput>();
    for (const step of steps) {
      try {
        const job = actionJobRegistry.get(step.jobId);
        const jobParams = job ? resolveStepReferences(step.jobParams, job.fields, stepOutputs) : step.jobParams;
        const result = await onRunActionJob(pageCard, step.jobId, jobParams);
        if (result) stepOutputs.set(step.id, result);
      } catch (err) {
        setRunError(err instanceof Error ? err.message : String(err));
        break;
      }
    }
    setRunning(false);
  }

  return (
    <CardShell selected={selected} className={isHidden ? "card-shell--hidden" : undefined} onSelect={onSelect}>
      <div className="card__header">
        <div className="card__header-start">
          <span className="card__title">{t("actionCard.pickerTileLabel")}</span>
          {!configured && <Badge>{t("actionCard.job.none")}</Badge>}
        </div>
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
      <CardFlippableBody
        card={canonicalCard}
        showingInfo={showingInfo}
        pageSiblings={pageSiblings}
        excludePageCardId={pageCard.id}
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
    </CardShell>
  );
}

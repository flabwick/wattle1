import { Badge, Button, CardShell, Icon } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { isKnownActionJob } from "../../../../lib/actionJobs.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";
import "./ActionCard.css";

/**
 * The "action" CardType's render — the whole-card counterpart to an inline
 * actionButton node (richText/actionButtonNode.ts): the entire card *is* one
 * calibrated button. Clicking it runs the configured job directly (no separate
 * "select, then run" step, same as the inline node's own view-mode click); the
 * header's gear button jumps into ActionCardEditor.tsx to calibrate it instead —
 * same "+"-slot convention as a note Card's "turn into stack" (Card.tsx), just a
 * settings icon rather than a plus since there's nothing to add, only configure. A
 * tap elsewhere on the card toggles selection (App.tsx's toggleSelectPageCard) — in
 * if not already selected, out again if it was; everything else (Save, Move, Hide,
 * remove) is reached from the Dock.
 */
export function ActionCardView({
  pageCard,
  selected,
  onSelect,
  onRequestEdit,
  onOpenFullscreen,
  onRunActionJob,
  generatingPageCardId,
}: CardTypeViewProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const action = canonicalCard.metadata.action;
  const jobId = action?.jobId ?? null;
  const label = action?.label || t("actionCard.defaultLabel");
  const running = generatingPageCardId === pageCard.id;
  const configured = isKnownActionJob(jobId ?? undefined);
  // Same "reveal hidden Cards" toggle Card.tsx's own "note" branch honors — shown
  // only while PageStack.tsx's revealHidden is on (see PageCardSlot), so this class
  // is always the "still hidden" indicator, never a false positive.
  const isHidden = Boolean(canonicalCard.metadata.hidden);

  return (
    <CardShell selected={selected} className={isHidden ? "card-shell--hidden" : undefined} onSelect={onSelect}>
      <div className="card__header">
        <div className="card__header-start">
          <span className="card__title">{t("actionCard.pickerTileLabel")}</span>
          {!configured && <Badge>{t("actionCard.job.none")}</Badge>}
        </div>
        <div className="card__header-actions">
          <Button
            iconOnly
            aria-label={t("actionCard.configure")}
            title={t("actionCard.configure")}
            onClick={(e) => {
              e.stopPropagation();
              onRequestEdit();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <Icon name="settings" />
          </Button>
          {onOpenFullscreen && (
            <Button
              iconOnly
              aria-label={t("card.openFullscreen")}
              title={t("card.openFullscreen")}
              onClick={(e) => {
                e.stopPropagation();
                onOpenFullscreen(pageCard.id);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <Icon name="expand" />
            </Button>
          )}
        </div>
      </div>
      <Button
        className="action-card__run"
        disabled={!configured || running}
        onClick={(e) => {
          e.stopPropagation();
          if (configured) onRunActionJob?.(pageCard, jobId ?? undefined, action?.jobParams ?? {});
        }}
      >
        <Icon name="generate" spin={running} />
        {label}
      </Button>
    </CardShell>
  );
}

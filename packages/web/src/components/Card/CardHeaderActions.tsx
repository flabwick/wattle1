import { Button, Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";

interface CardHeaderActionsProps {
  /** Omitted entirely (not just disabled) for the "stack" CardType's own View,
   *  which already has its own way to add an alternate (CardStackRail's "+") —
   *  turning a Stack into a Stack of Stacks doesn't mean anything. */
  onTurnIntoStack?: () => void;
  showingInfo: boolean;
  onToggleInfo: () => void;
  /** Removes this Card from the Page (App.tsx's handleRequestRemovePageCard) — the
   *  per-Card "X" every CardType's header now ends with (Card design pass). A
   *  Stack Card closes as a whole; anything else just detaches, vault Card
   *  untouched — see that handler's own doc comment. */
  onRemove: () => void;
}

/**
 * The three-icon header action row (turn into Stack, flip to info, remove) every
 * registered CardType's own View shows in its top-right corner — extracted from
 * Card.tsx's own inline header-actions block so every type gets the same actions
 * without re-implementing them. No Save/bookmark/fullscreen here any more (Card
 * design pass): every Card is treated as saved in the UI now, and fullscreen's own
 * header trigger is gone (the feature itself is untouched — see App.tsx's
 * focusedPageCardId — just not reachable from here until a Dock trigger, if ever,
 * replaces this one). Card.tsx (the "note" CardType) keeps its own original copy
 * rather than switching to this one, to avoid touching its already-working,
 * most-exercised render path.
 */
export function CardHeaderActions({ onTurnIntoStack, showingInfo, onToggleInfo, onRemove }: CardHeaderActionsProps) {
  return (
    <div className="card__header-actions">
      {onTurnIntoStack && (
        <Button
          iconOnly
          aria-label={t("card.turnIntoStack")}
          title={t("card.turnIntoStack")}
          onClick={(e) => {
            e.stopPropagation();
            onTurnIntoStack();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <Icon name="plus" />
        </Button>
      )}
      <Button
        iconOnly
        className={showingInfo ? "button--pressed" : undefined}
        aria-label={showingInfo ? t("card.hideInfo") : t("card.showInfo")}
        title={showingInfo ? t("card.hideInfo") : t("card.showInfo")}
        aria-pressed={showingInfo}
        onClick={(e) => {
          e.stopPropagation();
          onToggleInfo();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <Icon name="info" />
      </Button>
      <Button
        iconOnly
        aria-label={t("card.remove")}
        title={t("card.remove")}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <Icon name="close" />
      </Button>
    </div>
  );
}

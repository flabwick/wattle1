import { Button, Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";

interface CardHeaderActionsProps {
  /** Whether there's still something pending to commit to the vault — same formula
   *  Card.tsx's own header button uses: `pageCard.draftTitle !== null ||
   *  pageCard.draftContent !== null || !pageCard.card.savedToVault`. */
  hasUnsavedChanges: boolean;
  onSave: () => void;
  onOpenInVault: () => void;
  /** Omitted entirely (not just disabled) for the "stack" CardType's own View,
   *  which already has its own way to add an alternate (CardStackRail's "+") —
   *  turning a Stack into a Stack of Stacks doesn't mean anything. */
  onTurnIntoStack?: () => void;
  onOpenFullscreen?: () => void;
  showingInfo: boolean;
  onToggleInfo: () => void;
}

/**
 * The four-icon header action row (Save/Saved, turn into Stack, open fullscreen,
 * flip to info) every registered CardType's own View shows in its top-right corner —
 * extracted from Card.tsx's own inline header-actions block so every type gets the
 * same four actions without re-implementing them. Card.tsx (the "note" CardType)
 * keeps its own original copy rather than switching to this one, to avoid touching
 * its already-working, most-exercised render path.
 */
export function CardHeaderActions({
  hasUnsavedChanges,
  onSave,
  onOpenInVault,
  onTurnIntoStack,
  onOpenFullscreen,
  showingInfo,
  onToggleInfo,
}: CardHeaderActionsProps) {
  return (
    <div className="card__header-actions">
      {hasUnsavedChanges ? (
        <Button
          iconOnly
          className="card__save-btn"
          aria-label={t("dock.action.save")}
          title={t("dock.action.save")}
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <Icon name="bookmark" />
        </Button>
      ) : (
        <Button
          iconOnly
          className="card__save-btn card__save-btn--saved"
          aria-label={t("card.openInVault")}
          title={t("card.openInVault")}
          onClick={(e) => {
            e.stopPropagation();
            onOpenInVault();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <Icon name="done" />
        </Button>
      )}
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
      {onOpenFullscreen && (
        <Button
          iconOnly
          aria-label={t("card.openFullscreen")}
          title={t("card.openFullscreen")}
          onClick={(e) => {
            e.stopPropagation();
            onOpenFullscreen();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <Icon name="expand" />
        </Button>
      )}
      {/* The only flip/back control now — CardInfoPanel.tsx no longer has its own
          header/back button (that used to duplicate this). Toggling stays on this
          one icon; `button--pressed` (Button.css's own "currently on" treatment —
          same sunk/accent look the Dock's formatting toolbar uses for e.g. an
          active Bold) is what reads as "you're on the back face, click to return"
          instead of a separate labeled back arrow. */}
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
    </div>
  );
}

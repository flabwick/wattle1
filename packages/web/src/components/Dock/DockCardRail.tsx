import type { ReactNode } from "react";
import { Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./DockCardRail.css";

interface DockCardRailProps {
  /** -1 while the Dock holds no Cards at all — nothing to index into yet, but the
   *  rail still renders (just its "+", same as CardStackRail's own lone-member
   *  case) so there's always a way to create the first one. */
  index: number;
  total: number;
  atStart: boolean;
  atEnd: boolean;
  onPrevious: () => void;
  /** Both the last Card's forward arrow (turns into this once atEnd, including the
   *  "nothing yet" empty-Dock case) and — while there's only one Card — the rail's
   *  sole control. Mirrors CardStackRail's own onAdd exactly. */
  onAdd: () => void;
  onNext: () => void;
  /** True while the current Card has a generation streaming into it (Dock.tsx's own
   *  useGeneration instance) — navigating away mid-stream would leave that
   *  generation updating a Card no longer in view, so the whole rail locks until it
   *  settles, same reasoning as CardStackRail's own `disabled`. */
  disabled?: boolean;
  children: ReactNode;
}

/**
 * The Dock's own carousel controls — subtle arrows flanking the single Card
 * currently in view (Dock.tsx's redesign: many Cards, but only one shown at a
 * time, scrolled *through* rather than down a list of them), the right one
 * turning into a quiet "+" once you're at the end — same "+" convention
 * CardStackRail already uses for a Stack's own alternates, just positioned beside
 * the Card instead of tucked into its header corner (a Dock Card's own header
 * already has its own action row — CardHeaderActions — with no room left for a
 * second rail).
 */
export function DockCardRail({
  index,
  total,
  atStart,
  atEnd,
  onPrevious,
  onNext,
  onAdd,
  disabled = false,
  children,
}: DockCardRailProps) {
  return (
    <div className="dock__carousel">
      {total > 1 && (
        <button
          type="button"
          className="dock__carousel-arrow dock__carousel-arrow--prev"
          aria-label={t("cardStack.previous")}
          title={t("cardStack.previous")}
          disabled={atStart || disabled}
          onClick={onPrevious}
        >
          <Icon name="up" className="dock__carousel-arrow-icon--left" />
        </button>
      )}
      <div className="dock__carousel-slot">{children}</div>
      {total > 1 && (
        <span className="dock__carousel-position" aria-hidden="true">
          {index + 1} / {total}
        </span>
      )}
      <button
        type="button"
        className="dock__carousel-arrow dock__carousel-arrow--next"
        aria-label={atEnd ? t("cardStack.addAlternate") : t("cardStack.next")}
        title={atEnd ? t("cardStack.addAlternate") : t("cardStack.next")}
        disabled={disabled}
        onClick={atEnd ? onAdd : onNext}
      >
        <Icon name={atEnd ? "plus" : "up"} className={atEnd ? undefined : "dock__carousel-arrow-icon--right"} />
      </button>
    </div>
  );
}

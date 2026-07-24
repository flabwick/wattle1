import { Button, Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./CardStackRail.css";

interface CardStackRailProps {
  index: number;
  total: number;
  atStart: boolean;
  atEnd: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** Both the last member's forward arrow (turns into this once atEnd) and — while
   *  there's only one member — the rail's sole control. */
  onAdd: () => void;
  /** True while the active alternate has a generation streaming into it
   *  (StackBody.tsx) — navigating away mid-stream would leave that generation
   *  updating a member no longer in view, so the whole rail locks until it settles. */
  disabled?: boolean;
}

/**
 * T2: a small control cluster tucked into the top-right of the Card's own header
 * row (StackBody.tsx renders this as a sibling of .card__header-start, not a
 * separate bar above it) — no title of its own any more (the real title input
 * already sits right there) and no boxed/bordered "active" slot either. A Stack
 * with exactly one member reads as a plain Card with a quiet "+" in the corner;
 * back-caret and the "n / total" count only appear once adding that "+" has
 * actually made it a Stack (a second member exists) — there's nothing to navigate
 * or count with just one.
 */
export function CardStackRail({
  index,
  total,
  atStart,
  atEnd,
  onPrevious,
  onNext,
  onAdd,
  disabled = false,
}: CardStackRailProps) {
  return (
    <div className="card-stack-rail">
      {total > 1 && (
        <>
          <Button
            iconOnly
            aria-label={t("cardStack.previous")}
            title={t("cardStack.previous")}
            disabled={atStart || disabled}
            onClick={onPrevious}
          >
            <Icon name="up" className="card-stack-rail__arrow card-stack-rail__arrow--left" />
          </Button>
          <span className="card-stack-rail__position">
            {index + 1} / {total}
          </span>
        </>
      )}
      <Button
        iconOnly
        aria-label={atEnd ? t("cardStack.addAlternate") : t("cardStack.next")}
        title={atEnd ? t("cardStack.addAlternate") : t("cardStack.next")}
        disabled={disabled}
        onClick={atEnd ? onAdd : onNext}
      >
        <Icon
          name={atEnd ? "plus" : "up"}
          className={atEnd ? undefined : "card-stack-rail__arrow card-stack-rail__arrow--right"}
        />
      </Button>
    </div>
  );
}

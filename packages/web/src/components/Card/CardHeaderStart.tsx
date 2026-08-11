import type { ReactNode } from "react";
import { Button, Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";

/**
 * The fold/collapse toggle every CardType's own header now starts with — exported
 * on its own (not just inlined into CardHeaderStart below) because StackBody.tsx's
 * own header needs this exact button but can't use CardHeaderStart wholesale: a
 * Stack alternate's title editing lives on its own Info face now (same as every
 * other CardType — see CardInfoPanel.tsx's onChangeTitle), not inline here, but
 * StackBody still needs its own bespoke header layout for CardStackRail. Uses the
 * shared Button primitive (iconOnly) — same small bordered/shadowed tactile
 * treatment `.card__header .button` gives every header action, so the fold caret
 * reads as a button too, not a bare icon floating in the bar.
 */
export function CardCaretButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <Button
      iconOnly
      className="card__caret-btn"
      aria-label={collapsed ? t("card.expand") : t("card.collapse")}
      title={collapsed ? t("card.expand") : t("card.collapse")}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <Icon name="down" className={`card__caret${collapsed ? " card__caret--collapsed" : ""}`} />
    </Button>
  );
}

interface CardHeaderStartProps {
  /** Only rendered while `collapsed` — an expanded Card shows no title in its
   *  header at all (Card design pass: title editing moved to the Info face,
   *  CardInfoPanel.tsx's own onChangeTitle). No placeholder for an empty title
   *  either state — a blank middle is fine and still selectable via the header. */
  title: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Rendered right after the title span — the "file" CardType's own extension
   *  Badge is the one current user, slotting in the same spot Card.tsx's note
   *  render would have nothing to put there at all. Always shown regardless of
   *  `collapsed` — only the title itself is fold-gated. */
  children?: ReactNode;
}

/**
 * The fold-caret + (folded-only) title block every CardType's own header now
 * starts with — extracted from Card.tsx's own "note" render so every other
 * registered type gets identical treatment instead of each rolling its own.
 * Selecting the Card is the skinny header bar's own click now (Card design pass) —
 * this component has no select control of its own; the caller's `.card__header`
 * wrapper carries the click handler, with this button's own stopPropagation
 * keeping a fold tap from also toggling selection.
 */
export function CardHeaderStart({ title, collapsed, onToggleCollapsed, children }: CardHeaderStartProps) {
  return (
    <div className="card__header-start">
      <CardCaretButton collapsed={collapsed} onToggle={onToggleCollapsed} />
      {collapsed && title && <span className="card__title">{title}</span>}
      {children}
    </div>
  );
}

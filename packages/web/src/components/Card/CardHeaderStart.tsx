import type { ReactNode } from "react";
import { Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";

/**
 * The fold/collapse toggle every CardType's own header now starts with — exported
 * on its own (not just inlined into CardHeaderStart below) because StackBody.tsx's
 * own header needs this exact button but can't use CardHeaderStart wholesale: a
 * Stack alternate's title is a genuinely editable inline input (same convention
 * Card.tsx's own "note" render uses), not the plain read-only span every other
 * CardType's header shows, so StackBody keeps its own title markup and just reuses
 * this and CardSelectButton individually instead.
 */
export function CardCaretButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
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
    </button>
  );
}

/** The select-checkbox every CardType's own header now starts with — see
 *  CardCaretButton's own doc comment for why this is exported separately rather
 *  than only reachable through CardHeaderStart below. Selecting is *only* ever this
 *  checkbox for any CardType using it — the CardShell wrapping it should be given
 *  no `onSelect` of its own (see CardShell.tsx's own doc comment on that prop). */
export function CardSelectButton({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={`card__select-btn${selected ? " card__select-btn--selected" : ""}`}
      aria-label={selected ? t("card.deselect") : t("card.select")}
      title={selected ? t("card.deselect") : t("card.select")}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <span className="card__select-box" aria-hidden="true">
        {selected && <Icon name="done" />}
      </span>
    </button>
  );
}

interface CardHeaderStartProps {
  title: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selected: boolean;
  onSelect: () => void;
  /** Rendered right after the title span — the "file" CardType's own extension
   *  Badge is the one current user, slotting in the same spot Card.tsx's note
   *  render would have nothing to put there at all. */
  children?: ReactNode;
}

/**
 * The fold-caret + select-checkbox + title block every CardType's own header now
 * starts with — extracted from Card.tsx's own "note" render (the original, still
 * has its own separate copy rather than switching to this one, same "don't touch
 * the already-working, most-exercised render path" reasoning CardHeaderActions.tsx
 * followed) so every other registered type gets the identical fold/select
 * treatment instead of each rolling its own (previously: a plain read-only title
 * span, no fold at all, and selection only via tapping anywhere on the card body —
 * inconsistent with note's own header, and, for a type like "search" whose body is
 * mostly interactive controls, easy to trigger by accident).
 *
 * `title` is always a plain read-only span, never an inline-editable input —
 * unlike note (and the "stack" CardType's own active alternate, StackBody.tsx),
 * every other CardType edits its title (if it has one worth editing at all)
 * through its own Editor, reached however that type already gets there (e.g. a
 * double-click), not inline here.
 */
export function CardHeaderStart({
  title,
  collapsed,
  onToggleCollapsed,
  selected,
  onSelect,
  children,
}: CardHeaderStartProps) {
  return (
    <div className="card__header-start">
      <CardCaretButton collapsed={collapsed} onToggle={onToggleCollapsed} />
      <CardSelectButton selected={selected} onSelect={onSelect} />
      <span className="card__title">{title}</span>
      {children}
    </div>
  );
}

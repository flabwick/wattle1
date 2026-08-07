import { forwardRef } from "react";
import type { HTMLAttributes, KeyboardEvent } from "react";
import { useCardSelectGesture } from "../../hooks/useCardSelectGesture.js";
import type { CardSelectGestureMode } from "../../hooks/useCardSelectGesture.js";
import "./CardShell.css";

interface CardShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "onClick"> {
  selected?: boolean;
  /** Toggles this Card's membership in the current selection — resolved from the
   *  underlying pointer gesture (useCardSelectGesture) rather than called straight
   *  from a native click, so a drag, an in-progress/just-dismissed text selection,
   *  or a tap on an interactive child never also selects the card. Keyboard
   *  activation (Enter/Space below) calls it directly — there's no "double-press"
   *  gesture to disambiguate against for a keyboard user. Omit entirely (as
   *  Card.tsx's own note render does — selection lives in its own header button
   *  now) for a shell that's just a styled container, not a tap target itself. */
  onSelect?: () => void;
  /** 'instant' (the default) resolves a plain tap immediately. 'prose-aware' defers
   *  a tap landing in quotable rich-text prose so a following double-click
   *  (selecting a word for Quote) can cancel it instead of the card flickering
   *  selected. See useCardSelectGesture's own doc comment. Irrelevant when
   *  `onSelect` is omitted. */
  selectGesture?: CardSelectGestureMode;
}

/**
 * The tappable card container shell — background/border/radius/selection state,
 * styled purely from tokens.css. Compose actual card content as children.
 *
 * A `<div role="button">` rather than a real `<button>`: a caller may nest a real
 * `<button>` inside this shell (e.g. a header's own action row), and a button can't
 * legally contain another button — the div + role/tabIndex/keydown combination gives
 * the same tap/keyboard-activation semantics without that HTML nesting restriction.
 * Forwards its ref to the underlying div — Card.tsx uses this for its own
 * click-outside-to-close detection.
 */
export const CardShell = forwardRef<HTMLDivElement, CardShellProps>(function CardShell(
  { selected, className, onSelect, selectGesture = "instant", onKeyDown, ...rest },
  ref,
) {
  const gesture = useCardSelectGesture({ onSelect, mode: selectGesture });
  const selectedClass = selected ? " card-shell--selected" : "";
  const classes = `card-shell${selectedClass}${className ? ` ${className}` : ""}`;
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      className={classes}
      {...rest}
      onPointerDown={gesture.onPointerDown}
      onPointerMove={gesture.onPointerMove}
      onPointerUp={gesture.onPointerUp}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(e);
        // `e.target === e.currentTarget` — only the shell div itself, not some
        // nested interactive child (a search box, a title input, a button) that
        // happens to have focus. Without this, Space/Enter typed into e.g. a
        // Search Card's query field (SearchCardBody.tsx) never reaches the input
        // at all: the keydown bubbles here first, matches this same condition, and
        // gets preventDefault-ed before the browser ever inserts the character.
        if (!e.defaultPrevented && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect?.();
        }
      }}
    />
  );
});

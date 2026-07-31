import type { HTMLAttributes, KeyboardEvent, MouseEvent } from "react";
import "./CardShell.css";

interface CardShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "onClick"> {
  selected?: boolean;
  /** Takes the native click event (unlike a plain `() => void`) so a caller can tell
   *  a real single click apart from the first/second click of a double-click via
   *  `event.detail` — Card.tsx's own onClick uses this to avoid toggling selection
   *  twice (flickering on/off) during a double-click-to-select-text gesture.
   *  `event` is undefined for the keyboard-activation path below (Enter/Space isn't
   *  a MouseEvent at all), which callers should treat the same as a definite single
   *  click. */
  onClick?: (event?: MouseEvent<HTMLDivElement>) => void;
}

/**
 * The tappable card container shell — background/border/radius/selection state,
 * styled purely from tokens.css. Compose actual card content as children.
 *
 * A `<div role="button">` rather than a real `<button>`: Card.tsx nests a real
 * `<button>` (its Edit action) inside this shell, and a button can't legally contain
 * another button — the div + role/tabIndex/keydown combination gives the same
 * tap/keyboard-activation semantics without that HTML nesting restriction.
 */
export function CardShell({ selected, className, onClick, onKeyDown, ...rest }: CardShellProps) {
  const selectedClass = selected ? " card-shell--selected" : "";
  const classes = `card-shell${selectedClass}${className ? ` ${className}` : ""}`;
  return (
    <div
      role="button"
      tabIndex={0}
      className={classes}
      onClick={onClick}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(e);
        if (!e.defaultPrevented && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
      {...rest}
    />
  );
}

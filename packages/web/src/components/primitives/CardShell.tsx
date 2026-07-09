import type { HTMLAttributes, KeyboardEvent } from "react";
import "./CardShell.css";

interface CardShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "onClick"> {
  selected?: boolean;
  onClick?: () => void;
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

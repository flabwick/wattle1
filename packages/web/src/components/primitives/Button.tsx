import type { ButtonHTMLAttributes } from "react";
import "./Button.css";

type ButtonVariant = "default" | "primary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /**
   * True for an icon-only button (an `<Icon>` child, no visible text) — squares the
   * button up instead of using text-oriented horizontal padding. Callers must still
   * pass `aria-label`/`title`, since the visible label is gone.
   */
  iconOnly?: boolean;
}

/** A tap-target-sized button, styled purely from tokens.css — no new hardcoded values. */
export function Button({
  variant = "default",
  iconOnly = false,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const variantClass = variant === "default" ? "" : ` button--${variant}`;
  const iconClass = iconOnly ? " button--icon" : "";
  const classes = `button${variantClass}${iconClass}${className ? ` ${className}` : ""}`;
  return <button type={type} className={classes} {...rest} />;
}

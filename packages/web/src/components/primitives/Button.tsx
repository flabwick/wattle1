import type { ButtonHTMLAttributes } from "react";
import "./Button.css";

type ButtonVariant = "default" | "primary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** A tap-target-sized button, styled purely from tokens.css — no new hardcoded values. */
export function Button({ variant = "default", className, type = "button", ...rest }: ButtonProps) {
  const variantClass = variant === "default" ? "" : ` button--${variant}`;
  const classes = `button${variantClass}${className ? ` ${className}` : ""}`;
  return <button type={type} className={classes} {...rest} />;
}

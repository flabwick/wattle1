import { forwardRef } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes } from "react";
import { Icon } from "./Icon.js";
import type { IconName } from "./Icon.js";
import { InputField } from "./InputField.js";
import "./Popover.css";

/**
 * The box shell an anchored popover renders its content in — see Popover.css for
 * why position/z-index/flex-direction stay in the caller's own class instead of
 * here. Forwards its ref so callers can hand it straight to `useDismiss`.
 */
export const PopoverSurface = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function PopoverSurface({ className, ...rest }, ref) {
    return <div ref={ref} className={`popover-surface${className ? ` ${className}` : ""}`} {...rest} />;
  },
);

interface PopoverItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `list` (default): full-width row, no divider — CardLinkPicker/ContextCardPicker.
   *  `menu`: compact, border-bottom dividers, nowrap — ConvertPicker/ProcessPicker. */
  variant?: "list" | "menu";
  /** Rendered via the shared Icon primitive at `.popover-item__icon` size/color —
   *  omit for a picker whose row has no icon (a checkbox, or plain text). */
  icon?: IconName;
}

/** One row inside a popover's list/menu — see Popover.css's `.popover-item` for the
 *  two variants' shared and distinct styling. */
export function PopoverItem({ variant = "list", icon, className, children, ...rest }: PopoverItemProps) {
  const classes = `popover-item popover-item--${variant}${className ? ` ${className}` : ""}`;
  return (
    <button type="button" className={classes} {...rest}>
      {icon && <Icon name={icon} className="popover-item__icon" />}
      {children}
    </button>
  );
}

/** The search-as-you-type header a popover's list opens with — a leading search
 *  icon overlaid on an InputField. Passes every prop straight through to that
 *  InputField (value/onChange/placeholder/autoFocus/...). */
export function PopoverSearch(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="popover-search-wrap">
      <Icon name="search" className="popover-search-icon" />
      <InputField className="popover-search" {...props} />
    </div>
  );
}

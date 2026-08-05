import type { HTMLAttributes, ReactNode } from "react";
import { useDismiss } from "../../hooks/useDismiss.js";
import "./Overlay.css";

interface OverlayProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  onClose: () => void;
  children: ReactNode;
  /** Extends `.overlay__box` for per-instance sizing/background — e.g.
   *  AnnotationDetail.css overrides width/max-height/background/radius on top of
   *  this class's own defaults. */
  className?: string;
}

/**
 * A centered modal: dismissible backdrop + card-like box, sharing tokens.css's
 * standard border/shadow/radius treatment (Overlay.css). Escape and outside-press
 * both close it, via useDismiss — the same convention every anchored popover in the
 * app uses, so a modal and a popover dismiss identically even though they look
 * different. Doesn't portal itself — wrap the caller's own `createPortal` around it
 * when the trigger sits inside markup (a `<mark>`/`<sup>`/`<p>`) a `<div>` can't
 * legally nest in, same as AnnotationDetail.tsx does.
 */
export function Overlay({ onClose, children, className, ...rest }: OverlayProps) {
  const boxRef = useDismiss<HTMLDivElement>(onClose);
  return (
    <div className="overlay__backdrop">
      <div ref={boxRef} className={`overlay__box${className ? ` ${className}` : ""}`} {...rest}>
        {children}
      </div>
    </div>
  );
}

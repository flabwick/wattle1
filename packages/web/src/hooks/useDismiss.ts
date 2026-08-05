import { useEffect, useRef } from "react";
import type { RefObject } from "react";

interface UseDismissOptions {
  /** Whether the listeners are attached at all — for a dismiss boundary that's part
   *  of an always-mounted component (a popover toggled by local state, rather than
   *  one that only mounts while open), gate it on that open state. Defaults to true,
   *  which is correct whenever the caller itself only mounts while open. */
  enabled?: boolean;
  /** A CSS selector for a trigger element to also exclude from the outside-press
   *  check, alongside the returned ref's own subtree — so clicking the button that
   *  opened this again just closes it, rather than closing then immediately
   *  reopening. */
  excludeSelector?: string;
  /** Whether Escape also dismisses (default true) — every anchored popover in the
   *  app does; a few inline edit-mode boundaries deliberately don't (Escape is
   *  either unhandled or means something else there). */
  escape?: boolean;
}

/**
 * The app's one outside-press/Escape "dismiss" convention — previously duplicated
 * near-verbatim across every anchored popover and inline edit-mode boundary (see
 * primitives/README.md's Popover/Overlay entries). Attach the returned ref to
 * whichever element marks the boundary a pointerdown must land outside of to count
 * as "away".
 *
 * `onDismiss` is read via a ref internally, not a `useCallback` dependency — so
 * passing a fresh inline arrow function each render (the common case at call sites)
 * doesn't churn the listener subscription; only `enabled`/`excludeSelector`/`escape`
 * actually changing re-subscribes.
 */
export function useDismiss<T extends HTMLElement>(
  onDismiss: () => void,
  { enabled = true, excludeSelector, escape = true }: UseDismissOptions = {},
): RefObject<T> {
  const rootRef = useRef<T>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!enabled) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        !(excludeSelector && target.closest(excludeSelector))
      ) {
        onDismissRef.current();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismissRef.current();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    if (escape) document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      if (escape) document.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, excludeSelector, escape]);

  return rootRef;
}

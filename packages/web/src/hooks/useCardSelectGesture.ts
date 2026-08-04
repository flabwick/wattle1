import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/** Pointer movement beyond this (px) between pointerdown and pointerup means the
 *  gesture was a drag (text-select, scroll, ...) rather than a tap — never a
 *  card-select, regardless of what ends up selected at pointerup. Replaces relying
 *  on "did a click fire" alone, which a text-drag still does. Generous enough to
 *  absorb ordinary trackpad/touch click jitter (a real intentional tap can easily
 *  move several px) without letting a genuine drag through. */
const MOVE_THRESHOLD_PX = 16;

/** How long a tap that lands in quotable rich-text prose waits to see whether a
 *  second tap follows (making it a double-click selecting a word for Quote) before
 *  actually selecting the card — same value/rationale Card.tsx's own
 *  DOUBLE_CLICK_WINDOW_MS used to carry inline. Needs to be at least as long as the
 *  browser/OS's own double-click speed (commonly ~500ms, and user-configurable
 *  higher still) — anything shorter and the timer can fire and select the card
 *  *before* a slightly-slower-but-still-legitimate second tap ever arrives to
 *  cancel it. */
const DOUBLE_CLICK_WINDOW_MS = 500;

/** Elements a tap should never select the card through: form controls/links/
 *  buttons, a nested embed's own independently-selectable shell (CardEmbed.tsx/
 *  GhostCard.tsx's `.card-embed` — it stops its own click, but can't stop this
 *  ancestor's pointerup from seeing the same gesture), an annotation/Quote
 *  highlight mark (opens its own popover on click instead — CardRichText.tsx's
 *  `[data-annotation-id]`/`.selection-highlight` delegated listeners), and every
 *  floating menu/popover/overlay that portals to document.body: React still
 *  bubbles their synthetic pointer events up through the *component* tree to this
 *  ancestor despite living outside its DOM subtree, so their own onClick-only
 *  stopPropagation (which predates pointer-based select) doesn't shield a
 *  pointerup-driven decision — `closest()` against their own root class does
 *  instead. `[data-no-card-select]` is a manual escape hatch for anything else that
 *  needs it later. */
const INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "option",
  "label",
  '[contenteditable="true"]',
  "[data-no-card-select]",
  "[data-annotation-id]",
  ".card-embed",
  ".selection-highlight",
  ".selection-menu",
  ".card-quote-popup",
  ".annotation-detail__backdrop",
  ".diff-popover",
  ".action-field-popover",
  ".action-button-popover",
].join(", ");

function isRealSelection(selection: Selection | null): boolean {
  return !!selection && !selection.isCollapsed && selection.toString() !== "";
}

/** Whether `selection` actually belongs to `container` (this gesture's own Card) —
 *  a real selection can easily exist elsewhere on the page at the moment of an
 *  unrelated tap (text left selected in a different Card, or the word a just-
 *  finished double-click-to-Quote selected), and `window.getSelection()` is global,
 *  not scoped to whatever's being tapped. Without this, that leftover selection
 *  would look identical to "this tap is dismissing a highlight *in this Card*" and
 *  silently swallow an otherwise ordinary select tap. */
function isSelectionWithin(selection: Selection | null, container: Element): boolean {
  return !!selection && selection.rangeCount > 0 && container.contains(selection.getRangeAt(0).commonAncestorContainer);
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
}

/** Quotable rich-text prose (CardRichText.tsx's read-only render, the only mode
 *  SelectionMenu's double-click-to-select-a-word-for-Quote applies in) — a tap here
 *  needs to wait and see whether a second tap follows before selecting the card.
 *  Chrome outside it (header, padding, caret) resolves instantly either way. */
function isProseTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".card-rich-text") !== null;
}

export type CardSelectGestureMode = "instant" | "prose-aware";

interface UseCardSelectGestureOptions {
  onSelect?: () => void;
  /** 'instant' resolves a plain tap immediately on pointerup. 'prose-aware' defers
   *  a tap landing in quotable prose (isProseTarget) by DOUBLE_CLICK_WINDOW_MS so a
   *  following second tap there (a double-click selecting a word) can cancel it
   *  instead of the card flickering selected then immediately deselected. */
  mode: CardSelectGestureMode;
}

/**
 * Shared pointer-gesture resolution for "tap this Card to toggle its selection" —
 * every CardType's own View (via CardShell) wires this in so the guards (movement
 * threshold, an in-progress or just-dismissed text selection, interactive/portal
 * exclusion, double-click disambiguation for quotable prose) live in one place
 * instead of being copied, inconsistently, per type.
 */
export function useCardSelectGesture({ onSelect, mode }: UseCardSelectGestureOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const isDragging = useRef(false);
  // Whether a real (non-collapsed) text selection already existed *within this
  // Card* the moment this gesture's pointerdown fired, captured before the
  // browser's own default action (starting a new selection at the tap point) can
  // collapse/clear it — a tap that lands outside existing highlighted text to
  // dismiss it clears that selection as part of the same pointerdown, so checking
  // window.getSelection() again at pointerup would miss the very thing that should
  // disqualify it. Scoped via isSelectionWithin rather than a bare "is anything
  // selected anywhere" check — otherwise a selection left over in a *different*
  // Card (or the word a just-finished double-click-to-Quote selected) would block
  // this tap too.
  const hadSelectionAtDown = useRef(false);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pendingTimer.current !== null) clearTimeout(pendingTimer.current);
    };
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    startX.current = e.clientX;
    startY.current = e.clientY;
    isDragging.current = false;
    const selection = window.getSelection();
    hadSelectionAtDown.current = isRealSelection(selection) && isSelectionWithin(selection, e.currentTarget);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (isDragging.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) isDragging.current = true;
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const dragged = isDragging.current;
    isDragging.current = false;
    const selectionNow = window.getSelection();
    const hasSelectionNow = isRealSelection(selectionNow) && isSelectionWithin(selectionNow, e.currentTarget);
    const hadOrHasSelection = hadSelectionAtDown.current || hasSelectionNow;
    hadSelectionAtDown.current = false;

    // A drag (text-select, scroll, ...), a selection that existed just before or
    // exists right after this tap, or a tap that landed on something with its own
    // behavior is never a card-select.
    if (dragged || hadOrHasSelection || isInteractiveTarget(e.target)) {
      if (pendingTimer.current !== null) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
      return;
    }

    if (mode === "prose-aware" && isProseTarget(e.target)) {
      if (pendingTimer.current !== null) {
        // A second tap arrived within the window — this was a double-click
        // selecting a word for Quote, not two separate requests to select the
        // card. Cancel outright rather than ever having toggled at all.
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
        return;
      }
      pendingTimer.current = setTimeout(() => {
        pendingTimer.current = null;
        onSelect?.();
      }, DOUBLE_CLICK_WINDOW_MS);
      return;
    }

    if (pendingTimer.current !== null) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    onSelect?.();
  }

  return { onPointerDown, onPointerMove, onPointerUp };
}

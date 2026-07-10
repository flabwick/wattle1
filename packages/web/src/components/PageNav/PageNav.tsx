import type { PageWithCards } from "@wattle/shared";
import { Button, Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./PageNav.css";

interface PageNavProps {
  /** Top-to-bottom stack order (App.tsx's sortedPages) — index 0 is the topmost
   *  Page, same order/indexing canNavigateUp/onNavigateUp etc. already use. Drives
   *  the small dot row below. */
  pages: PageWithCards[];
  currentIndex: number;
  canNavigateUp: boolean;
  canNavigateDown: boolean;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  /** Jumps straight to `pages[index]` — the dot row's click target. */
  onSelectPage: (index: number) => void;
  onAddPage: () => void;
}

/**
 * Up/down between full-screen Pages (Step 7). Rendered by App.tsx as a normal flex
 * row sandwiched between the Page content and the Dock — not a `position: fixed`
 * overlay — so it always sits directly above the Dock however tall the Dock's own
 * row, Vault panel, or a streaming preview happen to make it, with no height math
 * and no overlap risk (Step 9).
 *
 * Pages are only ever added at the bottom of the stack, so there's no separate "new
 * Page" button: once there's nothing below the current Page, the down arrow itself
 * turns into a `+` and creates one there instead of navigating.
 */
export function PageNav({
  pages,
  currentIndex,
  canNavigateUp,
  canNavigateDown,
  onNavigateUp,
  onNavigateDown,
  onSelectPage,
  onAddPage,
}: PageNavProps) {
  const atBottom = !canNavigateDown;

  return (
    <div className="page-nav">
      <Button
        iconOnly
        aria-label={t("pageStack.up")}
        title={t("pageStack.up")}
        disabled={!canNavigateUp}
        onClick={onNavigateUp}
      >
        <Icon name="up" />
      </Button>
      {pages.length > 1 && (
        <div className="page-nav__dots" role="tablist" aria-label={t("pageStack.selectPage")}>
          {pages.map((page, i) => (
            <button
              key={page.id}
              type="button"
              role="tab"
              aria-selected={i === currentIndex}
              aria-label={`Page ${i + 1} of ${pages.length}`}
              title={`Page ${i + 1} of ${pages.length}`}
              className={`page-nav__dot${i === currentIndex ? " page-nav__dot--active" : ""}`}
              onClick={() => onSelectPage(i)}
            />
          ))}
        </div>
      )}
      <Button
        iconOnly
        aria-label={atBottom ? t("pageStack.addPage") : t("pageStack.down")}
        title={atBottom ? t("pageStack.addPage") : t("pageStack.down")}
        onClick={atBottom ? onAddPage : onNavigateDown}
      >
        <Icon name={atBottom ? "plus" : "down"} />
      </Button>
    </div>
  );
}

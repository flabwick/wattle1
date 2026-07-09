import { Button, Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./PageNav.css";

interface PageNavProps {
  canNavigateUp: boolean;
  canNavigateDown: boolean;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
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
  canNavigateUp,
  canNavigateDown,
  onNavigateUp,
  onNavigateDown,
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

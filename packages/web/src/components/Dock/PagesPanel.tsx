import type { PageSummary } from "@wattle/shared";
import { Button, Icon } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./PagesPanel.css";

interface PagesPanelProps {
  /** Home (Pages + Links + Search rebuild, Phase 4) — null only before first-run
   *  bootstrap finishes (App.tsx always has a Home Page by the time this can render). */
  homePageId: string | null;
  currentPageId: string | null;
  onGoHome: () => void;
  /** The scarce pin rail — every pinned Page, in pin order. */
  pinned: PageSummary[];
  isCurrentPagePinned: boolean;
  onTogglePinCurrent: () => void;
  onOpenPage: (id: string) => void;
  /** "Save as Template" with scope "page" — saves whichever Page is currently in
   *  view, not a specific row here. */
  onSaveAsTemplate: () => void;
}

/**
 * The Pages panel — Home + the scarce pin rail (Pages + Links + Search rebuild, Phase
 * 4). Finding a *specific* Page by title is the Vault panel's job now (search-first,
 * Phase 2); this stays a short, curated list of quick-access destinations instead of
 * growing into a second search box.
 */
export function PagesPanel({
  homePageId,
  currentPageId,
  onGoHome,
  pinned,
  isCurrentPagePinned,
  onTogglePinCurrent,
  onOpenPage,
  onSaveAsTemplate,
}: PagesPanelProps) {
  return (
    <div className="pages-panel">
      <div className="pages-panel__toolbar">
        <Button
          className={`pages-panel__home${currentPageId === homePageId ? " pages-panel__home--current" : ""}`}
          onClick={onGoHome}
          disabled={!homePageId || currentPageId === homePageId}
        >
          <Icon name="home" />
          {t("pages.home")}
        </Button>
        <Button
          iconOnly
          className={isCurrentPagePinned ? "button--pressed" : undefined}
          onClick={onTogglePinCurrent}
          disabled={!currentPageId}
          aria-label={isCurrentPagePinned ? t("pages.unpin") : t("pages.pin")}
          title={isCurrentPagePinned ? t("pages.unpin") : t("pages.pin")}
        >
          <Icon name="pin" />
        </Button>
      </div>
      <button type="button" className="pages-panel__save-as-template" onClick={onSaveAsTemplate}>
        {t("templates.saveAsTemplate")}
      </button>
      {pinned.length === 0 && <p className="pages-panel__empty">{t("pages.noPins")}</p>}
      {pinned.map((page) => (
        <button
          key={page.id}
          type="button"
          className={`pages-panel__item${page.id === currentPageId ? " pages-panel__item--current" : ""}`}
          onClick={() => onOpenPage(page.id)}
        >
          <span className="pages-panel__preview">{page.title || page.preview}</span>
        </button>
      ))}
    </div>
  );
}

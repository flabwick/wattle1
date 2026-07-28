import type { PageWithCards } from "@wattle/shared";
import { t } from "../../i18n/index.js";
import "./PagesPanel.css";

interface PagesPanelProps {
  /** Top-to-bottom stack order — same indexing as App.tsx's sortedPages/PageNav. */
  pages: PageWithCards[];
  currentIndex: number;
  onSelectPage: (index: number) => void;
  /** "Save as App" (Apps feature spec §5) with scope "page" — saves whichever Page
   *  is currently in view (this panel's own "focus"), not a specific row here. */
  onSaveAsApp: () => void;
}

/**
 * The Pages panel (Step 6 spec §3.5) — a vertical scrollable quick-jump list of every
 * Page in the current tab. PageNav's up/down arrows remain for adjacent navigation;
 * this is for jumping straight to a distant one. Pages have no title of their own
 * (schema.prisma's Page model), so each row is labeled by stack position, same
 * "Page N of Total" convention as PageNav's own dot row, plus a preview of its first
 * Card's title so rows are actually distinguishable from one another.
 */
export function PagesPanel({ pages, currentIndex, onSelectPage, onSaveAsApp }: PagesPanelProps) {
  return (
    <div className="pages-panel">
      <button type="button" className="pages-panel__save-as-app" onClick={onSaveAsApp}>
        {t("apps.saveAsApp")}
      </button>
      {pages.length === 0 && <p className="pages-panel__empty">{t("pageStack.empty")}</p>}
      {pages.map((page, i) => (
        <button
          key={page.id}
          type="button"
          className={`pages-panel__item${i === currentIndex ? " pages-panel__item--current" : ""}`}
          onClick={() => onSelectPage(i)}
        >
          <span className="pages-panel__index">{`Page ${i + 1} of ${pages.length}`}</span>
          <span className="pages-panel__preview">
            {page.pageCards[0]?.card.title || t("pageStack.emptyPreview")}
          </span>
        </button>
      ))}
    </div>
  );
}

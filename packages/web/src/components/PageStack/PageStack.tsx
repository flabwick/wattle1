import type { PageWithCards } from "@wattle/shared";
import { CardView } from "../Card/Card.js";
import { t } from "../../i18n/index.js";
import "./PageStack.css";

interface PageStackProps {
  /** The single Page currently in view (spec1.md Part 2 "Pages" — one Page fills the
   *  whole screen now, navigated with PageNav's up/down arrows, rather than all
   *  Pages stacked in one scrolling column). Null if there are no Pages yet. */
  currentPage: PageWithCards | null;
  selectedPageCardId: string | null;
  editingPageCardId: string | null;
  onSelectPageCard: (id: string | null) => void;
  onRequestEditPageCard: (id: string) => void;
  onChangeDraft: (pageCardId: string, draft: { title?: string; content?: string }) => void;
}

/**
 * One full-screen Page's Cards at a time — no title, no border/shadow "folio" box,
 * it IS the screen. Navigating between Pages and adding new ones lives in
 * `PageNav`/App.tsx now, not here — this component only renders whichever Page is
 * currently in view.
 */
export function PageStack({
  currentPage,
  selectedPageCardId,
  editingPageCardId,
  onSelectPageCard,
  onRequestEditPageCard,
  onChangeDraft,
}: PageStackProps) {
  return (
    <div className="page-stack">
      {currentPage ? (
        <>
          {currentPage.pageCards.length === 0 && (
            <p className="page-stack__page-empty">{t("pageStack.emptyPage")}</p>
          )}
          {currentPage.pageCards.map((pageCard) => (
            <CardView
              key={pageCard.id}
              pageCard={pageCard}
              selected={pageCard.id === selectedPageCardId}
              editing={pageCard.id === editingPageCardId}
              onSelect={() =>
                onSelectPageCard(pageCard.id === selectedPageCardId ? null : pageCard.id)
              }
              onRequestEdit={() => onRequestEditPageCard(pageCard.id)}
              onChangeDraft={(draft) => onChangeDraft(pageCard.id, draft)}
            />
          ))}
        </>
      ) : (
        <p className="page-stack__empty">{t("pageStack.empty")}</p>
      )}
    </div>
  );
}

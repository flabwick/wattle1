import type { PageWithCards } from "@wattle/shared";
import { CardView } from "../Card/Card.js";
import { Button } from "../primitives/index.js";
import { t } from "../../i18n/index.js";
import "./PageStack.css";

interface PageStackProps {
  pages: PageWithCards[];
  selectedPageCardId: string | null;
  onSelectPageCard: (id: string | null) => void;
  onAddPage: () => void;
  onRemovePage: (pageId: string) => void;
  onCreateCardInPage: (pageId: string) => void;
  onChangeDraft: (pageCardId: string, draft: { title?: string; content?: string }) => void;
}

/**
 * The vertical stack of Pages (spec1.md Part 2 "Pages"). Page.order ascends bottom
 * (0) to top, so the stack renders highest-order first — top of the stack is at the
 * top of the screen, matching "vertical scroll = moving between Pages."
 */
export function PageStack({
  pages,
  selectedPageCardId,
  onSelectPageCard,
  onAddPage,
  onRemovePage,
  onCreateCardInPage,
  onChangeDraft,
}: PageStackProps) {
  const topDown = [...pages].sort((a, b) => b.order - a.order);

  return (
    <div className="page-stack">
      <button type="button" className="page-stack__add" onClick={onAddPage}>
        {t("pageStack.addPage")}
      </button>

      {topDown.map((page) => (
        <section key={page.id} className="page">
          <header className="page__header">
            <span className="page__label">{t("pageStack.pageLabel")}</span>
            <div className="page__actions">
              <Button onClick={() => onCreateCardInPage(page.id)}>
                {t("pageStack.addCard")}
              </Button>
              <Button variant="danger" onClick={() => onRemovePage(page.id)}>
                {t("pageStack.deletePage")}
              </Button>
            </div>
          </header>

          {page.pageCards.length === 0 && (
            <p className="page__empty">{t("pageStack.emptyPage")}</p>
          )}

          {page.pageCards.map((pageCard) => (
            <CardView
              key={pageCard.id}
              pageCard={pageCard}
              selected={pageCard.id === selectedPageCardId}
              onSelect={() =>
                onSelectPageCard(pageCard.id === selectedPageCardId ? null : pageCard.id)
              }
              onChangeDraft={(draft) => onChangeDraft(pageCard.id, draft)}
            />
          ))}
        </section>
      ))}

      {pages.length === 0 && (
        <p className="page-stack__empty">{t("pageStack.empty")}</p>
      )}
    </div>
  );
}

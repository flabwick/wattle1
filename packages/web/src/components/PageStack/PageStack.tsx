import type { PageWithCards } from "@wattle/shared";
import { CardView } from "../Card/Card.js";
import "./PageStack.css";

interface PageStackProps {
  pages: PageWithCards[];
  selectedPageCardId: string | null;
  onSelectPageCard: (id: string | null) => void;
  onAddPage: () => void;
  onRemovePage: (pageId: string) => void;
  onCreateCardInPage: (pageId: string) => void;
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
}: PageStackProps) {
  const topDown = [...pages].sort((a, b) => b.order - a.order);

  return (
    <div className="page-stack">
      <button type="button" className="page-stack__add" onClick={onAddPage}>
        + New Page
      </button>

      {topDown.map((page) => (
        <section key={page.id} className="page">
          <header className="page__header">
            <span className="page__label">Page</span>
            <div className="page__actions">
              <button type="button" onClick={() => onCreateCardInPage(page.id)}>
                + Card
              </button>
              <button type="button" onClick={() => onRemovePage(page.id)} className="page__danger">
                Delete Page
              </button>
            </div>
          </header>

          {page.pageCards.length === 0 && (
            <p className="page__empty">No cards yet — open one from the vault or add a new one.</p>
          )}

          {page.pageCards.map((pageCard) => (
            <CardView
              key={pageCard.id}
              pageCard={pageCard}
              selected={pageCard.id === selectedPageCardId}
              onSelect={() =>
                onSelectPageCard(pageCard.id === selectedPageCardId ? null : pageCard.id)
              }
            />
          ))}
        </section>
      ))}

      {pages.length === 0 && (
        <p className="page-stack__empty">No Pages yet. Create one to start stacking context.</p>
      )}
    </div>
  );
}

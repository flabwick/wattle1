import { Fragment } from "react";
import type { PageCardWithCard, PageWithCards } from "@wattle/shared";
import { CardView } from "../Card/Card.js";
import { GhostCard } from "../Card/GhostCard.js";
import type { GhostCardNode } from "../../hooks/useGeneration.js";
import { cardTypeUiRegistry } from "../../registries/cardTypeUi.js";
import { getCardTypeId } from "../../lib/getCardTypeId.js";
import { t } from "../../i18n/index.js";
import "./PageStack.css";

interface PageCardSlotProps {
  pageCard: PageCardWithCard;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onRequestEdit: () => void;
  onChangeDraft: (draft: { title?: string; content?: string }) => void;
  selectedEmbedId: string | null;
  onSelectEmbed: (cardId: string, onRemove: () => void) => void;
}

/**
 * Picks how to render one PageCard's Card: the "note" type still goes straight
 * through CardView, unchanged, since that's the one type with a real inline editor
 * (click-outside-to-close, long-press-to-edit — see Card.tsx) that a generic
 * View/Editor split would otherwise have to duplicate. Every other registered type
 * (e.g. "file" — see the Dock's upload action) renders via cardTypeUiRegistry
 * instead, which is what a full C1-C5 rollout would eventually make the only path.
 */
function PageCardSlot({
  pageCard,
  selected,
  editing,
  onSelect,
  onRequestEdit,
  onChangeDraft,
  selectedEmbedId,
  onSelectEmbed,
}: PageCardSlotProps) {
  const typeId = getCardTypeId(pageCard.card);
  if (typeId === "note") {
    return (
      <CardView
        pageCard={pageCard}
        selected={selected}
        editing={editing}
        onSelect={onSelect}
        onRequestEdit={onRequestEdit}
        onChangeDraft={onChangeDraft}
        selectedEmbedId={selectedEmbedId}
        onSelectEmbed={onSelectEmbed}
      />
    );
  }
  const ui = cardTypeUiRegistry.get(typeId);
  if (editing) {
    return <ui.Editor pageCard={pageCard} onChangeDraft={onChangeDraft} />;
  }
  return (
    <ui.View pageCard={pageCard} selected={selected} onSelect={onSelect} onRequestEdit={onRequestEdit} />
  );
}

interface PageStackProps {
  /** The single Page currently in view (spec1.md Part 2 "Pages" — one Page fills the
   *  whole screen now, navigated with PageNav's up/down arrows, rather than all
   *  Pages stacked in one scrolling column). Null if there are no Pages yet. */
  currentPage: PageWithCards | null;
  /** Which way the last navigation moved (App.tsx's navDirection) — drives the slide
   *  animation below. Null on first load, so there's no animation on initial mount. */
  direction: "up" | "down" | null;
  selectedPageCardId: string | null;
  editingPageCardId: string | null;
  onSelectPageCard: (id: string | null) => void;
  onRequestEditPageCard: (id: string) => void;
  onChangeDraft: (pageCardId: string, draft: { title?: string; content?: string }) => void;
  selectedEmbedId: string | null;
  onSelectEmbed: (cardId: string, onRemove: () => void) => void;
  /** Move Mode (App.tsx's movingPageCardId) — the PageCard id in transit, or null. */
  movingPageCardId: string | null;
  /** Tap a drop zone to place the moving Card at this index (top-to-bottom, same
   *  convention as the reorder/move endpoints). */
  onDropAt: (index: number) => void;
  /** A generation streaming or awaiting review (App.tsx/useGeneration.ts), rendered in
   *  the same slot the real Card lands in once accepted: directly below a specific
   *  PageCard when `afterPageCardId` is set (generationService.persistGeneratedCard),
   *  or at the bottom of the Page when it's null — the "nothing selected" case
   *  (generationService.persistGeneratedCardToPage). Null (the whole prop) when no
   *  generation is in flight. */
  ghostCard: { afterPageCardId: string | null; rootId: number; nodes: Record<number, GhostCardNode> } | null;
}

/** Converts a "gap" position in the full rendered list (0..pageCards.length, where
 *  the moving Card's own ghosted slot still counts as one of the list's items) into
 *  the `destIndex` the move API expects — a position among *siblings only* (the
 *  moving Card excluded), since pageCardService.movePageCard splices it back in by
 *  destIndex against the destination's other PageCards. No-op when the moving Card
 *  isn't on this Page (movingIndex -1): every gap already only counts siblings. */
function toDestIndex(gap: number, movingIndex: number): number {
  if (movingIndex === -1 || gap <= movingIndex) return gap;
  return gap - 1;
}

/** A single tappable insertion point between Cards (or before the first/after the
 *  last) — explicit button-sized zones rather than thin hover lines, since this is a
 *  tap-first, mobile interaction (Move Mode). */
function DropZone({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="page-stack__drop-zone"
      onClick={onClick}
      aria-label={t("pageStack.dropHere")}
    >
      {t("pageStack.dropHere")}
    </button>
  );
}

/**
 * One full-screen Page's Cards at a time — no title, no border/shadow "folio" box,
 * it IS the screen. Navigating between Pages and adding new ones lives in
 * `PageNav`/App.tsx now, not here — this component only renders whichever Page is
 * currently in view.
 */
export function PageStack({
  currentPage,
  direction,
  selectedPageCardId,
  editingPageCardId,
  onSelectPageCard,
  onRequestEditPageCard,
  onChangeDraft,
  selectedEmbedId,
  onSelectEmbed,
  movingPageCardId,
  onDropAt,
  ghostCard,
}: PageStackProps) {
  const movingIndex = currentPage
    ? currentPage.pageCards.findIndex((pc) => pc.id === movingPageCardId)
    : -1;

  return (
    <div className="page-stack">
      {currentPage ? (
        // Keyed on the Page id so switching Pages remounts this wrapper — a fresh
        // element always replays its CSS animation on mount (unlike toggling a class
        // on a node that's already there), which is what makes the slide direction
        // below reliably retrigger on every navigation, not just the first one.
        <div
          key={currentPage.id}
          className={`page-stack__page${direction ? ` page-stack__page--${direction}` : ""}`}
        >
          {currentPage.pageCards.length === 0 && !movingPageCardId && (
            <p className="page-stack__page-empty">{t("pageStack.emptyPage")}</p>
          )}
          {movingPageCardId && movingIndex !== 0 && (
            <DropZone onClick={() => onDropAt(toDestIndex(0, movingIndex))} />
          )}
          {currentPage.pageCards.map((pageCard, index) => (
            <Fragment key={pageCard.id}>
              <div
                className={
                  pageCard.id === movingPageCardId ? "page-stack__slot page-stack__slot--moving" : undefined
                }
              >
                <PageCardSlot
                  pageCard={pageCard}
                  selected={pageCard.id === selectedPageCardId}
                  editing={pageCard.id === editingPageCardId}
                  onSelect={() =>
                    onSelectPageCard(pageCard.id === selectedPageCardId ? null : pageCard.id)
                  }
                  onRequestEdit={() => onRequestEditPageCard(pageCard.id)}
                  onChangeDraft={(draft) => onChangeDraft(pageCard.id, draft)}
                  selectedEmbedId={selectedEmbedId}
                  onSelectEmbed={onSelectEmbed}
                />
                {movingPageCardId && index !== movingIndex && index + 1 !== movingIndex && (
                  <DropZone onClick={() => onDropAt(toDestIndex(index + 1, movingIndex))} />
                )}
              </div>
              {ghostCard && ghostCard.afterPageCardId === pageCard.id && (
                <div className="page-stack__slot">
                  <GhostCard nodeId={ghostCard.rootId} nodes={ghostCard.nodes} />
                </div>
              )}
            </Fragment>
          ))}
          {/* "Nothing selected" generation (Dock's Generate action when only a Page,
              not a Card, is in view) — appends at the very bottom of the Page. */}
          {ghostCard && ghostCard.afterPageCardId === null && (
            <div className="page-stack__slot">
              <GhostCard nodeId={ghostCard.rootId} nodes={ghostCard.nodes} />
            </div>
          )}
        </div>
      ) : (
        <p className="page-stack__empty">{t("pageStack.empty")}</p>
      )}
    </div>
  );
}

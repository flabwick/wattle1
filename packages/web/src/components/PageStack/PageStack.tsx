import { Fragment } from "react";
import type { PageCardWithCard, PageWithCards } from "@wattle/shared";
import type { AnnotationProcess } from "../../api/client.js";
import { CardView } from "../Card/Card.js";
import { GhostCard } from "../Card/GhostCard.js";
import { FeedInputButton } from "../FeedInputButton/FeedInputButton.js";
import type { GhostCardNode } from "../../hooks/useGeneration.js";
import { cardTypeUiRegistry } from "../../registries/cardTypeUi.js";
import { getCardTypeId } from "../../lib/getCardTypeId.js";
import { t } from "../../i18n/index.js";
import "./PageStack.css";

interface PageCardSlotProps {
  pageCard: PageCardWithCard;
  selected: boolean;
  editing: boolean;
  /** The Dock's "reveal hidden cards" toggle (App.tsx state) — a hidden Card
   *  (card.metadata.hidden) renders nothing at all otherwise. Move Mode's drop-zone/
   *  index math (toDestIndex below) is untouched either way: this only decides
   *  whether *this* slot's content renders, not whether the slot itself exists in
   *  the list PageStack maps over. */
  revealHidden: boolean;
  onSelect: () => void;
  onCloseEditor: () => void;
  onRequestEdit: () => void;
  onChangeDraft: (draft: { title?: string; content?: string }) => void;
  selectedEmbedIds: ReadonlySet<string>;
  onSelectEmbed: (cardId: string, onRemove: () => void) => void;
  onRequestEditEmbed: (cardId: string, onRemove: () => void) => void;
  editingEmbedIds: ReadonlySet<string>;
  onToggleEmbedEdit: (cardId: string) => void;
  /** Diff/footnote/highlight processes (App.tsx's useAnnotations) — only threaded
   *  into the "note" branch below (CardView), same precedent as
   *  selectedEmbedId/onSelectEmbed: the cardTypeUiRegistry's generic ui.View/ui.Editor
   *  don't support per-embed selection either, so annotations don't reach them yet.
   *  The trailing `pageCardId` on three of these is CardView's (Card.tsx's) to fill
   *  in for its own top-level Card — see Card.tsx's wrapping closures — everything
   *  here just forwards App.tsx's real handler through unchanged. */
  onRunProcess: (cardId: string, process: AnnotationProcess, selectionText?: string, pageCardId?: string) => void;
  onCreateManualHighlight: (cardId: string, anchor: string, color: string, pageCardId?: string) => void;
  onAcceptDiff: (cardId: string, annotationId: string, pageCardId?: string) => void;
  onRemoveAnnotation: (cardId: string, annotationId: string) => void;
  onUpdateAnnotationText: (cardId: string, annotationId: string, text: string) => void;
  /** Powers any inline actionButton/actionField nodes in this Card's own rich
   *  content (rich-text follow-up to the Apps feature) — only the "note" branch
   *  below (CardView/Card.tsx) forwards these; the generic cardTypeUiRegistry path
   *  has no CardType left that uses them (the whole-card "action" CardType this was
   *  built for is gone — inline nodes replaced it entirely). */
  onRunActionJob: (
    pageCard: PageCardWithCard,
    jobId: string | undefined,
    jobParams: Record<string, unknown> | undefined,
  ) => void;
  generatingPageCardId: string | null;
  /** Every PageCard on this same Page — removeCard/saveCard's "pick a card on this
   *  page" selector (an inline actionButton's ActionButtonConfigPopover.tsx). */
  pageSiblings: PageCardWithCard[];
  /** Every Card's top-right "expand" corner button — opens it full-screen (App.tsx's
   *  focusedPageCardId). Forwarded to both the "note" branch (CardView) and the
   *  generic cardTypeUiRegistry path (currently only "stack" uses it). */
  onOpenFullscreen: (pageCardId: string) => void;
  /** The "note" branch's top-right "+" corner button — turns this Card into a Stack
   *  and adds a second alternate in one step (App.tsx's
   *  handleTurnIntoStackWithNewCard). Not part of the generic CardTypeUi props: a
   *  Stack Card's own "+" (StackBody.tsx) just adds another alternate directly,
   *  no App.tsx round trip needed. */
  onTurnIntoStack: (pageCardId: string) => void;
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
  revealHidden,
  onSelect,
  onCloseEditor,
  onRequestEdit,
  onChangeDraft,
  selectedEmbedIds,
  onSelectEmbed,
  onRequestEditEmbed,
  editingEmbedIds,
  onToggleEmbedEdit,
  onRunProcess,
  onCreateManualHighlight,
  onAcceptDiff,
  onRemoveAnnotation,
  onUpdateAnnotationText,
  onRunActionJob,
  generatingPageCardId,
  pageSiblings,
  onOpenFullscreen,
  onTurnIntoStack,
}: PageCardSlotProps) {
  // Excluded from normal Page rendering (Apps feature spec §2) — everything else
  // about this slot (Move Mode's drop zones, index math) stays exactly as if this
  // Card were rendering normally; only its own content disappears.
  if (pageCard.card.metadata.hidden && !revealHidden) {
    return null;
  }
  const typeId = getCardTypeId(pageCard.card);
  // A Card's title/content columns are always valid regardless of typeId, so
  // falling through to the plain "note" render is always safe — this is what
  // keeps a stale/unrecognized typeId (e.g. a leftover value from a CardType
  // that's since been removed) from crashing the entire Page instead of just
  // showing that one Card oddly.
  if (typeId === "note" || !cardTypeUiRegistry.has(typeId)) {
    return (
      <CardView
        pageCard={pageCard}
        selected={selected}
        editing={editing}
        onSelect={onSelect}
        onCloseEditor={onCloseEditor}
        onRequestEdit={onRequestEdit}
        onChangeDraft={onChangeDraft}
        selectedEmbedIds={selectedEmbedIds}
        onSelectEmbed={onSelectEmbed}
        onRequestEditEmbed={onRequestEditEmbed}
        editingEmbedIds={editingEmbedIds}
        onToggleEmbedEdit={onToggleEmbedEdit}
        onRunProcess={onRunProcess}
        onCreateManualHighlight={onCreateManualHighlight}
        onAcceptDiff={onAcceptDiff}
        onRemoveAnnotation={onRemoveAnnotation}
        onUpdateAnnotationText={onUpdateAnnotationText}
        onRunActionJob={onRunActionJob}
        generatingPageCardId={generatingPageCardId}
        pageSiblings={pageSiblings}
        onOpenFullscreen={() => onOpenFullscreen(pageCard.id)}
        onTurnIntoStack={() => onTurnIntoStack(pageCard.id)}
      />
    );
  }
  const ui = cardTypeUiRegistry.get(typeId);
  if (editing) {
    return (
      <ui.Editor
        pageCard={pageCard}
        onChangeDraft={onChangeDraft}
        onOpenFullscreen={onOpenFullscreen}
        onRunActionJob={onRunActionJob}
        generatingPageCardId={generatingPageCardId}
        pageSiblings={pageSiblings}
      />
    );
  }
  return (
    <ui.View
      pageCard={pageCard}
      selected={selected}
      onSelect={onSelect}
      onRequestEdit={onRequestEdit}
      onOpenFullscreen={onOpenFullscreen}
      onRunActionJob={onRunActionJob}
      generatingPageCardId={generatingPageCardId}
    />
  );
}

interface PageStackProps {
  /** The single Page currently in view (spec1.md Part 2 "Pages" — one Page fills the
   *  whole screen now, navigated with the Dock's merged page-nav cluster's up/down
   *  arrows, rather than all Pages stacked in one scrolling column). Null if there
   *  are no Pages yet. */
  currentPage: PageWithCards | null;
  /** Which way the last navigation moved (App.tsx's navDirection) — drives the slide
   *  animation below. Null on first load, so there's no animation on initial mount. */
  direction: "up" | "down" | null;
  /** The Dock's "reveal hidden cards" toggle (App.tsx state) — see
   *  PageCardSlotProps.revealHidden above. */
  revealHidden: boolean;
  /** Multiple Cards can be selected at once now — tapping a not-yet-selected Card
   *  adds it (App.tsx's toggleSelectPageCard); tapping an already-selected Card's
   *  body is a no-op (its own header's edit/deselect icons act on it instead). */
  selectedPageCardIds: ReadonlySet<string>;
  /** A Card only ever edits if it's also selected (App.tsx's exitEditPageCard/the
   *  Dock's own back-caret action both clear a Card from this set and
   *  selectedPageCardIds together), but not every selected Card is necessarily
   *  editing — same independent-per-Card convention as editingEmbedIds. */
  editingPageCardIds: ReadonlySet<string>;
  /** A tap on a not-yet-selected Card adds it to the selection; a no-op on an
   *  already-selected one (App.tsx's toggleSelectPageCard). */
  onTogglePageCard: (id: string) => void;
  /** The click-outside-to-close effect (Card.tsx) calls this instead — fully exits
   *  editing and deselects just this one Card (App.tsx's exitEditPageCard). */
  onCloseEditor: (id: string) => void;
  onRequestEditPageCard: (id: string) => void;
  onChangeDraft: (pageCardId: string, draft: { title?: string; content?: string }) => void;
  selectedEmbedIds: ReadonlySet<string>;
  onSelectEmbed: (cardId: string, onRemove: () => void) => void;
  /** Double-click / long-press an embedded Card to jump straight into editing it —
   *  see CardEmbed.tsx. */
  onRequestEditEmbed: (cardId: string, onRemove: () => void) => void;
  /** Embedded Cards (any depth, any number) currently in their own inline edit mode —
   *  see App.tsx's editingEmbedIds/toggleEditEmbed and CardEmbed.tsx. Independent of
   *  editingPageCardId: a parent and any combination of its embeds can each be
   *  editing or not, on their own. */
  editingEmbedIds: ReadonlySet<string>;
  onToggleEmbedEdit: (cardId: string) => void;
  /** Diff/footnote/highlight processes (App.tsx's useAnnotations) — see
   *  PageCardSlotProps above for why only the "note" branch gets these. */
  onRunProcess: (cardId: string, process: AnnotationProcess, selectionText?: string, pageCardId?: string) => void;
  onCreateManualHighlight: (cardId: string, anchor: string, color: string, pageCardId?: string) => void;
  onAcceptDiff: (cardId: string, annotationId: string, pageCardId?: string) => void;
  onRemoveAnnotation: (cardId: string, annotationId: string) => void;
  onUpdateAnnotationText: (cardId: string, annotationId: string, text: string) => void;
  /** See PageCardSlotProps.onRunActionJob/generatingPageCardId above. */
  onRunActionJob: (
    pageCard: PageCardWithCard,
    jobId: string | undefined,
    jobParams: Record<string, unknown> | undefined,
  ) => void;
  generatingPageCardId: string | null;
  /** See PageCardSlotProps.onOpenFullscreen/onTurnIntoStack above. */
  onOpenFullscreen: (pageCardId: string) => void;
  onTurnIntoStack: (pageCardId: string) => void;
  /** Move Mode (App.tsx's movingPageCardIds) — every PageCard id currently in
   *  transit as one batch (Step 6 spec §4.2's "Move" on a multi-selection), or empty
   *  when not moving. */
  movingPageCardIds: ReadonlySet<string>;
  /** Tap a drop zone to place the moving Card at this index (top-to-bottom, same
   *  convention as the reorder/move endpoints). */
  onDropAt: (index: number) => void;
  /** The Dock Card panel's own Move Mode (App.tsx's movingDockCardIds) — true while
   *  one or more Dock Cards are in transit to a Page. Unlike movingPageCardIds, none
   *  of the moving Cards are already rendered in *this* list (they're coming from
   *  the Dock, not from among currentPage.pageCards), so there's no ghosted slot to
   *  skip and no toDestIndex adjustment needed — the drop zones' plain gap index is
   *  already the right destIndex. */
  dockCardMoving: boolean;
  onDropDockCardAt: (index: number) => void;
  /** The embed action row's own Move Mode (App.tsx's movingEmbedCard) — true while a
   *  selected embed is in transit to a Page position. Same "not already rendered in
   *  this list, no toDestIndex adjustment needed" shape as dockCardMoving above. */
  embedMoving: boolean;
  onDropEmbedAt: (index: number) => void;
  /** A generation actively streaming in (App.tsx/useGeneration.ts), rendered in the
   *  same slot the real Card lands in once it's saved: directly below a specific
   *  PageCard when `afterPageCardId` is set (generationService.persistGeneratedCard),
   *  or at the bottom of the Page when it's null — the "nothing selected" case
   *  (generationService.persistGeneratedCardToPage). Null (the whole prop) once the
   *  stream ends — there's no review step in between, it's saved immediately and
   *  this slot hands off to the normal Card list. */
  ghostCard: { afterPageCardId: string | null; rootId: number; nodes: Record<number, GhostCardNode> } | null;
  /** The Feed Input Button (Step 6 spec §2) — lives at the end of the Page's own
   *  content (below the lowest Card, or in a blank Page's empty space), not as an
   *  extension of the Dock's fixed footer chrome. Null when there's no current Page
   *  to generate into/add a Card to. */
  feedInput: {
    generating: boolean;
    onStopGeneration: () => void;
    onGenerate: (instruction?: string) => void;
    onAddCard: (content: string) => void;
    onOpenVault: () => void;
    onUploadFile: (file: File) => void;
    onAddStack: () => void;
    onAddAction: () => void;
    onAddPrompt: () => void;
    onNewFromApp: () => void;
  } | null;
}

/** Converts a "gap" position in the full rendered list (0..pageCards.length, where
 *  every moving Card's own ghosted slot still counts as one of the list's items) into
 *  the `destIndex` the move API expects — a position among *siblings only* (every
 *  moving Card excluded), since pageCardService.movePageCard splices each one back in
 *  by destIndex against the destination's other PageCards. Generalizes the
 *  single-Card case to a whole batch (Step 6 spec §4.2): each moving Card whose
 *  current index falls before this gap has already been "removed" from the sibling
 *  list, shifting the gap left by one for each. */
function toDestIndex(gap: number, movingIndices: number[]): number {
  const removedBefore = movingIndices.filter((idx) => idx !== -1 && idx < gap).length;
  return gap - removedBefore;
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
 * it IS the screen. Navigating between Pages and adding new ones lives in the Dock's
 * merged page-nav cluster/App.tsx now, not here — this component only renders
 * whichever Page is currently in view.
 */
export function PageStack({
  currentPage,
  direction,
  revealHidden,
  selectedPageCardIds,
  editingPageCardIds,
  onTogglePageCard,
  onCloseEditor,
  onRequestEditPageCard,
  onChangeDraft,
  selectedEmbedIds,
  onSelectEmbed,
  onRequestEditEmbed,
  editingEmbedIds,
  onToggleEmbedEdit,
  onRunProcess,
  onCreateManualHighlight,
  onAcceptDiff,
  onRemoveAnnotation,
  onUpdateAnnotationText,
  onRunActionJob,
  generatingPageCardId,
  onOpenFullscreen,
  onTurnIntoStack,
  movingPageCardIds,
  onDropAt,
  dockCardMoving,
  onDropDockCardAt,
  embedMoving,
  onDropEmbedAt,
  ghostCard,
  feedInput,
}: PageStackProps) {
  const moving = movingPageCardIds.size > 0;
  const movingIndices = currentPage
    ? currentPage.pageCards
        .map((pc, i) => (movingPageCardIds.has(pc.id) ? i : -1))
        .filter((i) => i !== -1)
    : [];
  // Whichever kind of move is active, drop zones render the same way — the three are
  // mutually exclusive in practice (selection is already mutually exclusive across
  // Page Cards/Dock Cards/embeds, and Move is only reachable from a selection).
  const anyMoving = moving || dockCardMoving || embedMoving;
  const onDropAtGap = dockCardMoving
    ? onDropDockCardAt
    : embedMoving
      ? onDropEmbedAt
      : (gap: number) => onDropAt(toDestIndex(gap, movingIndices));

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
          {currentPage.pageCards.length === 0 && !anyMoving && (
            <p className="page-stack__page-empty">{t("pageStack.emptyPage")}</p>
          )}
          {anyMoving && <DropZone onClick={() => onDropAtGap(0)} />}
          {currentPage.pageCards.map((pageCard, index) => (
            <Fragment key={pageCard.id}>
              <div
                className={
                  movingPageCardIds.has(pageCard.id) ? "page-stack__slot page-stack__slot--moving" : undefined
                }
              >
                <PageCardSlot
                  pageCard={pageCard}
                  selected={selectedPageCardIds.has(pageCard.id)}
                  editing={editingPageCardIds.has(pageCard.id)}
                  revealHidden={revealHidden}
                  onSelect={() => onTogglePageCard(pageCard.id)}
                  onCloseEditor={() => onCloseEditor(pageCard.id)}
                  onRequestEdit={() => onRequestEditPageCard(pageCard.id)}
                  onChangeDraft={(draft) => onChangeDraft(pageCard.id, draft)}
                  selectedEmbedIds={selectedEmbedIds}
                  onSelectEmbed={onSelectEmbed}
                  onRequestEditEmbed={onRequestEditEmbed}
                  editingEmbedIds={editingEmbedIds}
                  onToggleEmbedEdit={onToggleEmbedEdit}
                  onRunProcess={onRunProcess}
                  onCreateManualHighlight={onCreateManualHighlight}
                  onAcceptDiff={onAcceptDiff}
                  onRemoveAnnotation={onRemoveAnnotation}
                  onUpdateAnnotationText={onUpdateAnnotationText}
                  onRunActionJob={onRunActionJob}
                  generatingPageCardId={generatingPageCardId}
                  pageSiblings={currentPage.pageCards}
                  onOpenFullscreen={onOpenFullscreen}
                  onTurnIntoStack={onTurnIntoStack}
                />
                {anyMoving && <DropZone onClick={() => onDropAtGap(index + 1)} />}
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
          {/* The Feed Input Button lives here — at the end of the Page's own content,
              below the lowest Card (or right below the empty-page message, for a
              blank Page) — not as part of the Dock's fixed footer chrome. Hidden
              during Move Mode, same as the row of DropZones it would otherwise sit
              below: there's nothing to generate/add into a Page mid-move. */}
          {feedInput && !anyMoving && (
            <FeedInputButton
              generating={feedInput.generating}
              onStopGeneration={feedInput.onStopGeneration}
              onGenerate={feedInput.onGenerate}
              onAddCard={feedInput.onAddCard}
              onOpenVault={feedInput.onOpenVault}
              onUploadFile={feedInput.onUploadFile}
              onAddStack={feedInput.onAddStack}
              onAddAction={feedInput.onAddAction}
              onAddPrompt={feedInput.onAddPrompt}
              onNewFromApp={feedInput.onNewFromApp}
            />
          )}
        </div>
      ) : (
        <p className="page-stack__empty">{t("pageStack.empty")}</p>
      )}
    </div>
  );
}

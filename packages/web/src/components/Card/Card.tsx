import { useState } from "react";
import type { FocusEvent } from "react";
import type { PageCardSnapshot, PageCardWithCard } from "@wattle/shared";
import type { AnnotationProcess } from "../../api/client.js";
import { CardShell, Icon } from "../primitives/index.js";
import { CardRichText } from "./richtext/CardRichText.js";
import { CardHeaderStart } from "./CardHeaderStart.js";
import { CardHeaderActions } from "./CardHeaderActions.js";
import { CardInfoPanel } from "./CardInfoPanel.js";
import { useCard } from "../../hooks/useCard.js";
import { useDismiss } from "../../hooks/useDismiss.js";
import { useEditHistoryRecorder } from "../../hooks/useEditHistoryRecorder.js";
import { editCard } from "../../lib/cardStore.js";
import { t } from "../../i18n/index.js";
import "./Card.css";

interface CardProps {
  pageCard: PageCardWithCard;
  selected: boolean;
  /** Whether this Card is currently the Dock's own formatting-toolbar target — set
   *  by focusing its title or its rich text (onActivateEditor below), cleared by
   *  clicking away (onCloseEditor calls App.tsx's exitEditPageCard). Purely Dock
   *  bookkeeping now: this Card's content is always editable (unless frozen)
   *  regardless of this flag, so it doesn't change anything about how the Card
   *  itself renders — it only gates the click-away listener below. */
  editing: boolean;
  /** Tapping anywhere on this Card's own skinny header bar toggles its membership
   *  in the current (possibly multi-Card) selection, in if not already selected,
   *  out again if it was (App.tsx's toggleSelectPageCard). Move/Hide are still
   *  reached from the Dock instead of a per-Card popup; removing has its own
   *  header button now too (see onRemove below). */
  onSelect: () => void;
  /** Marks this Card as the Dock's own formatting-toolbar target (App.tsx's
   *  activatePageCardEditor, which also forks first if this Card is frozen —
   *  though a frozen Card's title/content aren't focusable to begin with, since
   *  neither renders editable below) — wired to this Card's own onFocus, so simply
   *  clicking into the title or the rich text to start typing is what "enters"
   *  editing now, not a separate gesture or mode. */
  onActivateEditor: () => void;
  /** The click-outside-to-close effect below calls this to drop this Card back out
   *  of the Dock's formatting-toolbar target (App.tsx's exitEditPageCard) — same
   *  net effect losing focus would have, but resolved via pointerdown-outside
   *  instead so a Dock button click (which blurs the editor a beat before its own
   *  onClick runs) doesn't yank the toolbar out from under itself. */
  onCloseEditor: () => void;
  /** The header's own "X" (App.tsx's handleRequestRemovePageCard) — removes this
   *  Card from the Page (Card design pass — replaces the old Save/bookmark slot,
   *  which is gone: every Card is treated as saved in the UI now). */
  onRemove: () => void;
  onChangeDraft: (draft: { title?: string; content?: string }) => void;
  /** Every embedded Card independently selected (App.tsx state) — see
   *  CardContent.tsx's doc comment. Wired into both render branches below now: an
   *  embed can be selected/edited independently of whether this Card itself is
   *  being edited, and several embeds can be selected at once. */
  selectedEmbedIds?: ReadonlySet<string>;
  onSelectEmbed?: (cardId: string, onRemove: () => void) => void;
  /** Double-click / long-press an embedded Card to jump straight into editing it
   *  (see CardEmbed.tsx). */
  onRequestEditEmbed?: (cardId: string, onRemove: () => void) => void;
  /** Embedded Cards (any depth, any number) currently in their own inline edit mode
   *  — independent of `editing` above, so this Card and any combination of its
   *  embeds can each be editing or not, on their own (App.tsx/CardEmbed.tsx). */
  editingEmbedIds: ReadonlySet<string>;
  onToggleEmbedEdit: (cardId: string) => void;
  /** Diff/footnote/highlight processes (App.tsx's useAnnotations) — forwarded (via
   *  this component's own wrapping closures below, which inject `pageCard.id` as the
   *  trailing `pageCardId` whenever the call is about *this* Card, not a nested
   *  embed — see resolveDraftTarget's doc comment in annotationService.ts for why a
   *  not-yet-saved top-level Card needs that) to this Card's own CardContent (read
   *  view only; the editing view below has no overlays, see CardContentEditor.tsx)
   *  and, unwrapped, to every embed nested inside it. */
  onRunProcess?: (cardId: string, process: AnnotationProcess, selectionText?: string, pageCardId?: string) => void;
  onCreateManualHighlight?: (cardId: string, anchor: string, color: string, pageCardId?: string) => void;
  onAcceptDiff?: (cardId: string, annotationId: string, pageCardId?: string) => void;
  onRemoveAnnotation?: (cardId: string, annotationId: string) => void;
  onUpdateAnnotationText?: (cardId: string, annotationId: string, text: string) => void;
  /** Powers any inline actionButton/actionField nodes in this Card's own rich
   *  content (rich-text follow-up to the Apps feature) — see
   *  CardRichText.tsx/CardEditingContext.tsx. Only ever passed at depth 0 (this
   *  component only ever renders a top-level Card, never a nested embed), so an
   *  action button here always has a real owning PageCard to act on. */
  onRunActionJob?: (
    pageCard: PageCardWithCard,
    jobId: string | undefined,
    jobParams: Record<string, unknown> | undefined,
  ) => void;
  generatingPageCardId?: string | null;
  pageSiblings?: PageCardWithCard[];
  /** The header's "+" corner button — turns this Card into a Stack and immediately
   *  adds a second (blank) alternate to it, in one step (App.tsx's
   *  handleTurnIntoStackWithNewCard). */
  onTurnIntoStack?: () => void;
  /** The full state system's Undo/Redo — fires once a title/content edit burst
   *  settles (see useEditHistoryRecorder.ts), wired to App.tsx's
   *  `history.record("edit", ...)`. Omitted for a nested embed's own CardView (only
   *  ever rendered at depth 0 — see onRunActionJob's doc comment above), same as
   *  the top-level-only action job wiring. */
  onRecordEditHistory?: (before: PageCardSnapshot, after: PageCardSnapshot) => void;
}

/**
 * A Card rendered inside a Page. Content is always directly editable in place —
 * there's no separate "view" vs "edit" mode to enter or exit any more, only frozen
 * Cards (Open/Frozen — Wattle vault plan) stay read-only, since they're meant to be
 * stable, safe-to-reference context rather than something to change in place.
 * Selecting the Card (for the Dock's batch Move/Hide/Remove actions) is a
 * completely separate gesture from editing its text: the skinny header bar itself
 * (`.card__header`, click anywhere on it) toggles selection regardless of anything
 * else going on — every clickable child inside (fold caret, +/i/x) stops
 * propagation so a tap on one of those doesn't also toggle selection. Clicking into
 * the rich text body to type is all "entering editing" takes now, and it only
 * affects the Dock's own formatting-toolbar targeting (onActivateEditor/
 * onCloseEditor below), not this Card's own appearance. There is no Save affordance
 * in the UI any more (Card design pass) — every Card reads as saved; renaming
 * happens on the Info face (CardInfoPanel's own onChangeTitle) instead of an
 * always-visible header input, and the header shows a title at all only while
 * folded.
 *
 * Once a Card has been saved to the vault at least once (`card.savedToVault`),
 * every keystroke commits straight to the vault Card, live, through the same shared
 * cardStore CardEmbed.tsx uses (see editCard/useCard) — so any other open instance
 * of this same Card, on this Page or any other, updates immediately too. A Card
 * that has *never* been saved to the vault yet is still page-local scratch content
 * (schema.prisma's Card.savedToVault doc comment) — those edits still go through
 * the draft flow instead (onChangeDraft, App.tsx/usePages.ts) exactly as before;
 * there's just no explicit Save button left to promote it into the vault any more
 * (backend savedToVault/draft columns are untouched by this pass — see the Card
 * design plan's own "minimum: no Save button and no unsaved affordance").
 */
export function CardView({
  pageCard,
  selected,
  editing,
  onSelect,
  onActivateEditor,
  onCloseEditor,
  onRemove,
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
  onTurnIntoStack,
  onRecordEditHistory,
}: CardProps) {
  // Purely a display preference, not app state — doesn't need to be lifted above
  // this component (unlike selection/editing, nothing else needs to react to it).
  const [collapsed, setCollapsed] = useState(false);
  // Whether this Card is showing its info back-face (title/dates/links/relationships,
  // CardInfoPanel.tsx) instead of its own content — same "flip" mechanic as the
  // prompt CardType's own front/back faces (PromptCardBody.tsx), just for a static
  // info view here rather than input-vs-output.
  const [showingInfo, setShowingInfo] = useState(false);

  const savedToVault = pageCard.card.savedToVault;
  // Once saved, `pageCard.card` (only as fresh as the last listPages fetch) stops
  // being the source of truth in favor of the live cardStore cache — the same one
  // every CardEmbed of this id reads from — so edits made through an embed, or
  // through this same Card open on a different Page, show up here immediately too.
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const title = savedToVault ? canonicalCard.title : pageCard.draftTitle ?? pageCard.card.title;
  const content = savedToVault ? canonicalCard.content : pageCard.draftContent ?? pageCard.card.content;
  // Only relevant while the Dock's "reveal hidden cards" toggle is on — see
  // PageStack.tsx's PageCardSlot, which doesn't render this Card at all otherwise.
  const isHidden = Boolean(canonicalCard.metadata.hidden);
  // Frozen (Open/Frozen — Wattle vault plan): read-only, safe as stable context —
  // the one case content still isn't directly editable (title stays a static span,
  // CardRichText stays non-editable below), same as everywhere else Frozen already
  // means "not directly editable" (embeds, Dock Cards).
  const isFrozen = Boolean(canonicalCard.frozenAt);

  // The full state system's Undo/Redo: coalesces this Card's own title/content
  // changes into one history entry per pause/edit-session, independent of the
  // live-save calls (editCard/onChangeDraft) above — see useEditHistoryRecorder.ts.
  // Only active while `editing` (the Dock's formatting-toolbar target) and never
  // for a Frozen Card, which isn't directly editable to begin with.
  useEditHistoryRecorder({
    enabled: editing && !isFrozen,
    pageCardId: pageCard.id,
    cardId: pageCard.card.id,
    order: pageCard.order,
    title,
    content,
    metadata: canonicalCard.metadata,
    onCommit: (before, after) => onRecordEditHistory?.(before, after),
  });

  function handleTitleChange(value: string) {
    if (isFrozen) return;
    if (savedToVault) {
      editCard(pageCard.card.id, { title: value });
    } else {
      onChangeDraft({ title: value });
    }
  }

  function handleContentChange(value: string) {
    if (isFrozen) return;
    if (savedToVault) {
      editCard(pageCard.card.id, { content: value });
    } else {
      onChangeDraft({ content: value });
    }
  }

  // Injects this Card's own `pageCard.id` as the trailing pageCardId whenever the
  // call is about this Card's own cardId (as opposed to a nested embed's, which these
  // same wrapped closures also get passed to unchanged — an embed's cardId never
  // matches pageCard.card.id, so the injection is a no-op for it, correctly leaving
  // annotationService.ts to resolve straight from the embed's own vault Card row).
  const wrappedOnRunProcess = onRunProcess
    ? (cardId: string, process: AnnotationProcess, selectionText?: string) =>
        onRunProcess(cardId, process, selectionText, cardId === pageCard.card.id ? pageCard.id : undefined)
    : undefined;
  const wrappedOnCreateManualHighlight = onCreateManualHighlight
    ? (cardId: string, anchor: string, color: string) =>
        onCreateManualHighlight(cardId, anchor, color, cardId === pageCard.card.id ? pageCard.id : undefined)
    : undefined;
  const wrappedOnAcceptDiff = onAcceptDiff
    ? (cardId: string, annotationId: string) =>
        onAcceptDiff(cardId, annotationId, cardId === pageCard.card.id ? pageCard.id : undefined)
    : undefined;

  // Click-outside-to-close: only listens while this Card is the Dock's own
  // formatting-toolbar target, and only acts on presses outside the Card itself
  // (so clicking the title/content, or the caret/select button, never drops it).
  // Also excludes the Dock: it's a toolbar *for* this editing session (Save/
  // Remove/Move/formatting buttons), physically outside cardRef in the DOM but not
  // an "away" click — without this, pointerdown on any Dock button would drop this
  // Card out of `editing` a beat before the Dock's own onClick (which fires later,
  // on "click") ever got to run.
  const cardRef = useDismiss<HTMLDivElement>(onCloseEditor, {
    enabled: editing,
    excludeSelector: ".dock",
    escape: false,
  });

  // Clicking a <button> (the caret, the select button, or a header action) also
  // focuses it in most browsers, and CardShell's own outer div is itself a
  // tabbable `role="button"` (primitives/CardShell.tsx) — without these guards,
  // either would incorrectly mark this Card as the Dock's formatting-toolbar
  // target too, even though nothing about the title or the rich text itself was
  // actually touched.
  function handleFocus(e: FocusEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) return;
    if ((e.target as Element).closest("button")) return;
    onActivateEditor();
  }

  return (
    <CardShell
      selected={selected}
      className={isHidden ? "card-shell--hidden" : undefined}
      data-material={canonicalCard.metadata.material}
      ref={cardRef}
      // Marks this Card as the Dock's formatting-toolbar target the moment either
      // the title input or the rich text gains focus — React's onFocus bubbles
      // (via the native focusin event), so one handler here catches both without
      // needing to wire each individually (handleFocus above excludes the header's
      // own buttons, which also receive focus on click). Frozen Cards render
      // neither the title nor the content as focusable in the first place (see
      // below), so this never fires for one.
      onFocus={isFrozen ? undefined : handleFocus}
    >
      <div className="card__header" onClick={onSelect}>
        <CardHeaderStart title={title} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)}>
          {isFrozen && (
            <span className="card__frozen-badge" title={t("card.frozen")} aria-label={t("card.frozen")}>
              <Icon name="lock" />
            </span>
          )}
        </CardHeaderStart>
        <CardHeaderActions
          onTurnIntoStack={onTurnIntoStack}
          showingInfo={showingInfo}
          onToggleInfo={() => setShowingInfo((v) => !v)}
          onRemove={onRemove}
        />
      </div>
      {!collapsed && (
        <div className={`card__flip${showingInfo ? " card__flip--flipped" : ""}`}>
          <div className={`card__face card__face--front${showingInfo ? " card__face--hidden" : ""}`}>
            <CardRichText
              content={content}
              onChangeContent={handleContentChange}
              editable={!isFrozen}
              cardId={pageCard.card.id}
              annotations={canonicalCard.metadata.annotations}
              ancestorIds={new Set([pageCard.card.id])}
              depth={0}
              selectedEmbedIds={selectedEmbedIds}
              onSelectEmbed={onSelectEmbed}
              onRequestEditEmbed={onRequestEditEmbed}
              editingEmbedIds={editingEmbedIds}
              onToggleEmbedEdit={onToggleEmbedEdit}
              onRunProcess={wrappedOnRunProcess}
              onCreateManualHighlight={wrappedOnCreateManualHighlight}
              onAcceptDiff={wrappedOnAcceptDiff}
              onRemoveAnnotation={onRemoveAnnotation}
              onUpdateAnnotationText={onUpdateAnnotationText}
              ownerPageCard={pageCard}
              onRunActionJob={onRunActionJob}
              generatingPageCardId={generatingPageCardId}
              pageSiblings={pageSiblings}
            />
          </div>
          <div className={`card__face card__face--back${showingInfo ? "" : " card__face--hidden"}`}>
            <CardInfoPanel card={canonicalCard} onChangeTitle={handleTitleChange} />
          </div>
        </div>
      )}
    </CardShell>
  );
}

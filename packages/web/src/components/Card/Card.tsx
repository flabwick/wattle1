import { useState } from "react";
import type { FocusEvent } from "react";
import type { PageCardWithCard } from "@wattle/shared";
import type { AnnotationProcess } from "../../api/client.js";
import { Button, CardShell, Icon, InputField } from "../primitives/index.js";
import { CardRichText } from "./richtext/CardRichText.js";
import { CardInfoPanel } from "./CardInfoPanel.js";
import { useCard } from "../../hooks/useCard.js";
import { useDismiss } from "../../hooks/useDismiss.js";
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
  /** Tapping this Card's own header select button (the checkbox beside the fold
   *  caret) toggles its membership in the current (possibly multi-Card) selection,
   *  in if not already selected, out again if it was (App.tsx's
   *  toggleSelectPageCard). Move/Hide/remove are still reached from the Dock
   *  instead of a per-Card popup; Save has its own header button now too (see
   *  onSave below). */
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
  /** The header's own bookmark-shaped Save button (App.tsx's handleSavePageCard)
   *  — called while there's still something pending (see hasUnsavedChanges
   *  below): a not-yet-vaulted Card's draft title/content, or a still-page-local
   *  Card that's never been saved at all. Once nothing's pending, the same button
   *  slot switches to a tick instead (onOpenInVault below) rather than
   *  disappearing outright. */
  onSave: () => void;
  /** The same header button once there's nothing left to save — a tick in place
   *  of the bookmark, same "you're done, here's where it lives" convention
   *  Spotify's own saved-track checkmark uses. Opens the Vault panel searching
   *  for this Card by its current title (App.tsx's handleOpenCardInVault). */
  onOpenInVault: (title: string) => void;
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
  /** The header's "expand" corner button — opens this Card full-screen (App.tsx's
   *  focusedPageCardId), independent of selection/editing state. */
  onOpenFullscreen?: () => void;
  /** The header's "+" corner button — turns this Card into a Stack and immediately
   *  adds a second (blank) alternate to it, in one step (App.tsx's
   *  handleTurnIntoStackWithNewCard). */
  onTurnIntoStack?: () => void;
}

/**
 * A Card rendered inside a Page. Content is always directly editable in place —
 * there's no separate "view" vs "edit" mode to enter or exit any more, only frozen
 * Cards (Open/Frozen — Wattle vault plan) stay read-only, since they're meant to be
 * stable, safe-to-reference context rather than something to change in place.
 * Selecting the Card (for the Dock's batch Save/Move/Hide/Remove actions) is a
 * completely separate gesture from editing its text: the header's own select button
 * (beside the fold caret) toggles selection regardless of anything else going on;
 * clicking into the title or the rich text body to type is all "entering editing"
 * takes now, and it only affects the Dock's own formatting-toolbar targeting
 * (onActivateEditor/onCloseEditor below), not this Card's own appearance.
 *
 * Once a Card has been saved to the vault at least once (`card.savedToVault`),
 * every keystroke commits straight to the vault Card, live, through the same shared
 * cardStore CardEmbed.tsx uses (see editCard/useCard) — so any other open instance
 * of this same Card, on this Page or any other, updates immediately too, and
 * there's nothing left to save. The header's own bookmark/tick button (onSave/
 * onOpenInVault below) reflects this either way: a bookmark while there's still
 * something page-local or draft to commit, a tick once there isn't — tapping the
 * tick doesn't do anything to the Card itself, it just opens the Vault to it.
 *
 * A Card that has *never* been saved to the vault yet is still page-local scratch
 * content (schema.prisma's Card.savedToVault doc comment) — those edits go through
 * the draft/Save flow instead (onChangeDraft, App.tsx/usePages.ts), same as before,
 * until the first explicit Save promotes it into the vault and this switches over.
 */
export function CardView({
  pageCard,
  selected,
  editing,
  onSelect,
  onActivateEditor,
  onCloseEditor,
  onSave,
  onOpenInVault,
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
  // Whether there's anything for the header's own Save button to do — any
  // not-yet-vaulted Card (the common case: freshly created, still page-local
  // scratch content) or a pending draft. No title required to save (a Card can have
  // no title by default — see cardService.createCard's own doc comment).
  const hasUnsavedChanges = pageCard.draftTitle !== null || pageCard.draftContent !== null || !savedToVault;

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
      <div className="card__header card__header--pinned">
        <div className="card__header-start">
          <button
            type="button"
            className="card__caret-btn"
            aria-label={collapsed ? t("card.expand") : t("card.collapse")}
            title={collapsed ? t("card.expand") : t("card.collapse")}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <Icon name="down" className={`card__caret${collapsed ? " card__caret--collapsed" : ""}`} />
          </button>
          <button
            type="button"
            className={`card__select-btn${selected ? " card__select-btn--selected" : ""}`}
            aria-label={selected ? t("card.deselect") : t("card.select")}
            title={selected ? t("card.deselect") : t("card.select")}
            aria-pressed={selected}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <span className="card__select-box" aria-hidden="true">
              {selected && <Icon name="done" />}
            </span>
          </button>
          {isFrozen ? (
            title && <span className="card__title">{title}</span>
          ) : (
            // No placeholder: an untitled Card just shows blank space here, not a
            // ghost "Untitled" — the input itself (flex: 1, Card.css) already
            // fills the whole header-start row up to the frozen badge/header
            // actions, so clicking anywhere in that blank space still focuses it.
            <InputField className="card__title-input" value={title} onChange={(e) => handleTitleChange(e.target.value)} />
          )}
          {isFrozen && (
            <span className="card__frozen-badge" title={t("card.frozen")} aria-label={t("card.frozen")}>
              <Icon name="lock" />
            </span>
          )}
        </div>
        <div className="card__header-actions">
          {hasUnsavedChanges ? (
            <Button
              iconOnly
              className="card__save-btn"
              aria-label={t("dock.action.save")}
              title={t("dock.action.save")}
              onClick={(e) => {
                e.stopPropagation();
                onSave();
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <Icon name="bookmark" />
            </Button>
          ) : (
            <Button
              iconOnly
              className="card__save-btn card__save-btn--saved"
              aria-label={t("card.openInVault")}
              title={t("card.openInVault")}
              onClick={(e) => {
                e.stopPropagation();
                onOpenInVault(title);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <Icon name="done" />
            </Button>
          )}
          {onTurnIntoStack && (
            <Button
              iconOnly
              aria-label={t("card.addCard")}
              title={t("card.addCard")}
              onClick={(e) => {
                e.stopPropagation();
                onTurnIntoStack();
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <Icon name="plus" />
            </Button>
          )}
          {onOpenFullscreen && (
            <Button
              iconOnly
              aria-label={t("card.openFullscreen")}
              title={t("card.openFullscreen")}
              onClick={(e) => {
                e.stopPropagation();
                onOpenFullscreen();
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <Icon name="expand" />
            </Button>
          )}
          <Button
            iconOnly
            className={showingInfo ? "button--pressed" : undefined}
            aria-label={showingInfo ? t("card.hideInfo") : t("card.showInfo")}
            title={showingInfo ? t("card.hideInfo") : t("card.showInfo")}
            aria-pressed={showingInfo}
            onClick={(e) => {
              e.stopPropagation();
              setShowingInfo((v) => !v);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <Icon name="info" />
          </Button>
        </div>
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
            <CardInfoPanel card={canonicalCard} />
          </div>
        </div>
      )}
    </CardShell>
  );
}

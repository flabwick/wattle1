import { useEffect, useRef, useState } from "react";
import type { TouchEvent } from "react";
import type { PageCardWithCard } from "@wattle/shared";
import type { AnnotationProcess } from "../../api/client.js";
import { Button, CardShell, Icon, InputField } from "../primitives/index.js";
import { CardRichText } from "./richtext/CardRichText.js";
import { useCard } from "../../hooks/useCard.js";
import { editCard } from "../../lib/cardStore.js";
import { t } from "../../i18n/index.js";
import "./Card.css";

/** How long a touch has to hold before it counts as a long-press rather than a tap. */
const LONG_PRESS_MS = 500;

interface CardProps {
  pageCard: PageCardWithCard;
  selected: boolean;
  /** Whether this Card's inline editor is open — controlled from above (App.tsx). */
  editing: boolean;
  /** A tap — selects this Card if it wasn't already, or (if it already was) jumps
   *  straight into editing it instead (App.tsx's toggleSelectPageCard). Deselecting
   *  no longer happens by tapping again; see onCloseEditor below and the Dock's own
   *  back-caret action for that. */
  onSelect: () => void;
  /** The click-outside-to-close effect below calls this instead of onSelect —
   *  fully exits editing *and* deselects this one Card (App.tsx's
   *  exitEditPageCard), same net effect onSelect's old toggle-off used to have,
   *  without onSelect itself doing double duty as both "tap" and "click away". */
  onCloseEditor: () => void;
  /** Jump straight into editing this Card — double-click on desktop, long-press on
   *  touch (see the touch handlers below), or the Dock's Edit action. */
  onRequestEdit: () => void;
  onChangeDraft: (draft: { title?: string; content?: string }) => void;
  /** Which embedded Card, if any, is independently selected (App.tsx state) — see
   *  CardContent.tsx's doc comment. Wired into both render branches below now: an
   *  embed can be selected/edited independently of whether this Card itself is
   *  being edited. */
  selectedEmbedId?: string | null;
  onSelectEmbed?: (cardId: string, onRemove: () => void) => void;
  /** Double-click / long-press an embedded Card to jump straight into editing it —
   *  same convention as onRequestEdit above, just for an embed instead of this Card
   *  itself (see CardEmbed.tsx). */
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
  /** The header's "X" corner button — closes/removes this Card from the Page
   *  (App.tsx's handleRequestRemovePageCard). */
  onRequestRemove?: () => void;
}

/**
 * A Card rendered inside a Page. Editing happens inline, in place on the page — the
 * Dock's Edit action opens it, so does double-clicking/long-pressing the Card itself
 * (see Dock.tsx and the gesture handlers below) — and swaps this Card's own body for a
 * title input + textarea right where it sits, rather than a separate editor elsewhere.
 *
 * Once a Card has been saved to the vault at least once (`card.savedToVault`),
 * there's no explicit "Done"/close button and no "unsaved" indicator any more:
 * every keystroke commits straight to the vault Card, live, through the same shared
 * cardStore CardEmbed.tsx uses (see editCard/useCard) — so any other open instance
 * of this same Card, on this Page or any other, updates immediately too, and
 * there's nothing left to save or lose. Clicking anywhere outside the Card while
 * it's editing just deselects it, which closes the editor as a side effect (App.tsx
 * resets `editing` whenever the selected Card changes).
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
  onCloseEditor,
  onRequestEdit,
  onChangeDraft,
  selectedEmbedId,
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
  onRequestRemove,
}: CardProps) {
  // Purely a display preference, not app state — doesn't need to be lifted above
  // this component (unlike selection/editing, nothing else needs to react to it).
  const [collapsed, setCollapsed] = useState(false);

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

  function handleTitleChange(value: string) {
    if (savedToVault) {
      editCard(pageCard.card.id, { title: value });
    } else {
      onChangeDraft({ title: value });
    }
  }

  function handleContentChange(value: string) {
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

  const editorRef = useRef<HTMLDivElement>(null);

  // Click-outside-to-close: only listens while editing, and only acts on presses
  // outside the editor itself (so clicking the title/content inputs, or the caret,
  // never closes it). Also excludes the Dock: it's a toolbar *for* this editing
  // session (Save/Remove/Move/an embed's own Edit button, etc.), physically outside
  // editorRef in the DOM but not an "away" click — without this, pointerdown on any
  // Dock button would close/deselect this Card a beat before the Dock's own onClick
  // (which fires later, on "click") ever got to run.
  useEffect(() => {
    if (!editing) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element;
      if (editorRef.current && !editorRef.current.contains(target) && !target.closest(".dock")) {
        onCloseEditor();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [editing, onCloseEditor]);

  // Long-press-to-edit on touch devices, where there's no dblclick: start a timer on
  // touchstart, fire onRequestEdit if it's still pressed LONG_PRESS_MS later, and
  // cancel it on touchmove/touchend/touchcancel so an ordinary tap or a scroll isn't
  // mistaken for a hold. touchEndedAsLongPress suppresses the synthetic click that
  // browsers fire after touchend, so lifting the finger doesn't also toggle selection.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchEndedAsLongPress = useRef(false);

  function clearLongPressTimer() {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleTouchStart() {
    touchEndedAsLongPress.current = false;
    clearLongPressTimer();
    longPressTimer.current = setTimeout(() => {
      touchEndedAsLongPress.current = true;
      onRequestEdit();
    }, LONG_PRESS_MS);
  }

  function handleTouchEnd(e: TouchEvent) {
    clearLongPressTimer();
    if (touchEndedAsLongPress.current) {
      e.preventDefault();
    }
  }

  const headerActions = (onOpenFullscreen || onTurnIntoStack || onRequestRemove) && (
    <div className="card__header-actions">
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
      {onRequestRemove && (
        <Button
          iconOnly
          aria-label={t("card.remove")}
          title={t("card.remove")}
          onClick={(e) => {
            e.stopPropagation();
            onRequestRemove();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <Icon name="close" />
        </Button>
      )}
    </div>
  );

  if (editing) {
    return (
      <div
        ref={editorRef}
        className={`card-shell card-shell--editing card-shell--selected${isHidden ? " card-shell--hidden" : ""}`}
      >

        <div className="card__header">
          <div className="card__header-start">
            {/* Same slot the caret occupies in the static view, so the title lines
                up exactly the same either way — not interactive here: collapsing
                the very editor you're typing into wouldn't mean anything. */}
            <span className="card__caret-btn card__caret-btn--static" aria-hidden="true">
              <Icon name="down" className="card__caret" />
            </span>
            <InputField
              className="card__title-input"
              value={title}
              placeholder={t("card.titlePlaceholder")}
              autoFocus
              onChange={(e) => handleTitleChange(e.target.value)}
            />
          </div>
          {headerActions}
        </div>
        <CardRichText
          content={content}
          onChangeContent={handleContentChange}
          editable
          cardId={pageCard.card.id}
          annotations={canonicalCard.metadata.annotations}
          ancestorIds={new Set([pageCard.card.id])}
          depth={0}
          ownerPageCard={pageCard}
          onRunActionJob={onRunActionJob}
          generatingPageCardId={generatingPageCardId}
          pageSiblings={pageSiblings}
          selectedEmbedId={selectedEmbedId}
          onSelectEmbed={onSelectEmbed}
          onRequestEditEmbed={onRequestEditEmbed}
          editingEmbedIds={editingEmbedIds}
          onToggleEmbedEdit={onToggleEmbedEdit}
          onRunProcess={wrappedOnRunProcess}
          onCreateManualHighlight={wrappedOnCreateManualHighlight}
          onAcceptDiff={wrappedOnAcceptDiff}
          onRemoveAnnotation={onRemoveAnnotation}
          onUpdateAnnotationText={onUpdateAnnotationText}
        />
      </div>
    );
  }

  return (
    <CardShell
      selected={selected}
      className={isHidden ? "card-shell--hidden" : undefined}
      onClick={onSelect}
      onDoubleClick={onRequestEdit}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={clearLongPressTimer}
      onTouchCancel={clearLongPressTimer}
    >
      <div className="card__header">
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
            <Icon
              name="down"
              className={`card__caret${collapsed ? " card__caret--collapsed" : ""}`}
            />
          </button>
          {title && <span className="card__title">{title}</span>}
        </div>
        {headerActions}
      </div>
      {!collapsed && (
        <CardRichText
          content={content}
          onChangeContent={handleContentChange}
          editable={false}
          cardId={pageCard.card.id}
          annotations={canonicalCard.metadata.annotations}
          ancestorIds={new Set([pageCard.card.id])}
          depth={0}
          selectedEmbedId={selectedEmbedId}
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
      )}
    </CardShell>
  );
}

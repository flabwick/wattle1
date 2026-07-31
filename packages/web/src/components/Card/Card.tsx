import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { PageCardWithCard } from "@wattle/shared";
import type { AnnotationProcess } from "../../api/client.js";
import { Button, CardShell, Icon, InputField } from "../primitives/index.js";
import { CardRichText } from "./richtext/CardRichText.js";
import { useCard } from "../../hooks/useCard.js";
import { editCard } from "../../lib/cardStore.js";
import { t } from "../../i18n/index.js";
import "./Card.css";

/** How long a click waits to see whether a second one follows (making it a
 *  double-click) before actually toggling selection — see selectClickTimer below.
 *  Needs to be at least as long as the browser/OS's own double-click speed
 *  (commonly ~500ms, and user-configurable higher still) — anything shorter and
 *  the timer can fire and select the Card *before* a slightly-slower-but-still-
 *  legitimate second click ever arrives to cancel it, which is worse than a barely
 *  perceptible delay on an ordinary single click. */
const DOUBLE_CLICK_WINDOW_MS = 500;

interface CardProps {
  pageCard: PageCardWithCard;
  selected: boolean;
  /** Whether this Card's inline editor is open — controlled from above (App.tsx). */
  editing: boolean;
  /** A click/tap anywhere on the Card body toggles its own membership in the current
   *  (possibly multi-Card) selection — tapping it in adds it, tapping it again
   *  removes it (App.tsx's toggleSelectPageCard). Held back briefly by
   *  handleShellClick/selectClickTimer below rather than called straight from the
   *  click: a double-click/long-press selects text for a Quote instead (native
   *  browser selection + SelectionMenu.tsx), and shouldn't touch selection at all,
   *  not even a brief flicker from its first click. Everything else (Edit, Save,
   *  Move, Hide, remove) is reached from the Dock instead of a per-Card popup. */
  onSelect: () => void;
  /** The click-outside-to-close effect below calls this instead of onSelect —
   *  fully exits editing *and* deselects this one Card (App.tsx's
   *  exitEditPageCard), same net effect a second tap has once this Card is no
   *  longer editing, without onSelect itself doing double duty as both "tap" and
   *  "click away". */
  onCloseEditor: () => void;
  /** Jump straight into editing this Card — only ever the Dock's own Edit action
   *  now (shown while exactly one Card is selected). Used to also be reachable via
   *  double-click/long-press directly on the Card, but both gestures were
   *  repurposed for text-selection/Quote instead (see onSelect above) — a
   *  double-click briefly toggling selection off then back on to enter editing,
   *  and a hold gesture stealing the browser's own long-press-to-select behavior,
   *  made picking a word to quote unreliable. */
  onRequestEdit: () => void;
  onChangeDraft: (draft: { title?: string; content?: string }) => void;
  /** Every embedded Card independently selected (App.tsx state) — see
   *  CardContent.tsx's doc comment. Wired into both render branches below now: an
   *  embed can be selected/edited independently of whether this Card itself is
   *  being edited, and several embeds can be selected at once. */
  selectedEmbedIds?: ReadonlySet<string>;
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
}

/**
 * A Card rendered inside a Page. Editing happens inline, in place on the page — the
 * Dock's Edit action (only shown for a single selected Card) is the only way in now;
 * a plain click/tap instead just selects the Card (toggling its membership in the
 * current selection, wherever on the Card body it lands), and a double-click/
 * long-press instead selects text for a Quote (SelectionMenu.tsx) rather than
 * jumping into editing — swaps this Card's own body for a title input + textarea
 * right where it sits, rather than a separate editor elsewhere.
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

  // A click doesn't toggle selection immediately — it waits DOUBLE_CLICK_WINDOW_MS
  // to see whether a second click follows within that window. If one does (this is
  // actually a double-click, selecting a word to quote), the pending toggle is
  // cancelled outright rather than firing on the first click and just skipping the
  // second — a double-click shouldn't touch the Card's selection state at all, not
  // even briefly. Keyboard activation (Enter/Space — see CardShell.tsx, `event` is
  // undefined there) bypasses this entirely and toggles immediately: there's no
  // "double-press" gesture to disambiguate against for a keyboard user, and adding
  // an artificial delay there would just be a regression for them.
  const selectClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether a real (non-collapsed) text selection already existed the moment this
  // gesture's mousedown fired — set by handleShellMouseDown below, read (and reset)
  // by handleShellClick. Needed because a click that lands *outside* existing
  // highlighted text to dismiss it clears that selection as part of the same
  // mousedown/click, so by the time the click handler runs and checks
  // window.getSelection() itself, the very thing that should have disqualified it
  // is already gone — this captures it a moment earlier, before that happens.
  const hadSelectionOnMouseDown = useRef(false);

  useEffect(() => {
    return () => {
      if (selectClickTimer.current !== null) clearTimeout(selectClickTimer.current);
    };
  }, []);

  function isRealSelection(selection: Selection | null): boolean {
    return !!selection && !selection.isCollapsed && selection.toString() !== "";
  }

  function handleShellMouseDown() {
    hadSelectionOnMouseDown.current = isRealSelection(window.getSelection());
  }

  function handleShellClick(e?: MouseEvent<HTMLDivElement>) {
    if (!e) {
      onSelect();
      return;
    }
    // Disqualifies this click from toggling selection at all if either:
    //  - a real text selection exists right now — a mousedown-drag-mouseup still
    //    fires "click" on release (same target either side, regardless of
    //    movement in between), but it just finished making a selection, not
    //    requesting the Card; same for the word a double-click's second click
    //    may have just selected, on top of the timer-cancel below already
    //    covering that case too; or
    //  - a selection existed *before* this click (hadSelectionOnMouseDown) — this
    //    click landed outside it, dismissing it, which isn't a request to select
    //    the Card either.
    // A plain click starting and ending with nothing selected trips neither.
    const hadOrHasSelection = hadSelectionOnMouseDown.current || isRealSelection(window.getSelection());
    hadSelectionOnMouseDown.current = false;
    if (hadOrHasSelection) {
      if (selectClickTimer.current !== null) {
        clearTimeout(selectClickTimer.current);
        selectClickTimer.current = null;
      }
      return;
    }
    if (selectClickTimer.current !== null) {
      clearTimeout(selectClickTimer.current);
      selectClickTimer.current = null;
      return;
    }
    selectClickTimer.current = setTimeout(() => {
      selectClickTimer.current = null;
      onSelect();
    }, DOUBLE_CLICK_WINDOW_MS);
  }

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

  const headerActions = (onOpenFullscreen || onTurnIntoStack) && (
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
        />
      </div>
    );
  }

  return (
    <CardShell
      selected={selected}
      className={isHidden ? "card-shell--hidden" : undefined}
      // handleShellClick above delays toggling selection just long enough to see
      // whether a second click follows (a double-click, selecting a word to
      // quote), in which case it cancels rather than ever toggling at all.
      // Nothing extra needed for the "select text instead" half — this Card used
      // to also wire onDoubleClick to onRequestEdit and run a long-press timer
      // that did the same on touch; dropping both entirely just gets out of the
      // way and lets native browser double-click/long-press text selection (and
      // SelectionMenu.tsx, which is always listening) happen on its own.
      onMouseDown={handleShellMouseDown}
      onClick={handleShellClick}
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
      )}
    </CardShell>
  );
}

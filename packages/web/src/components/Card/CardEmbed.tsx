import { useRef, useState } from "react";
import type { TouchEvent } from "react";
import type { AnnotationProcess } from "../../api/client.js";
import { addExistingCardToDock, wrapCardInStack } from "../../api/client.js";
import { useCard } from "../../hooks/useCard.js";
import { useDismiss } from "../../hooks/useDismiss.js";
import { editCard } from "../../lib/cardStore.js";
import { getCardTypeId } from "../../lib/getCardTypeId.js";
import { t } from "../../i18n/index.js";
import { CardRichText } from "./richtext/CardRichText.js";
import { CardHeaderStart } from "./CardHeaderStart.js";
import { CardHeaderActions } from "./CardHeaderActions.js";
import { CardFlippableBody } from "./CardFlippableBody.js";
import "./CardEmbed.css";

/** Hard cap on nesting depth — a genuine cycle (A embeds B embeds A) is caught by
 *  `ancestorIds` below regardless of depth, this only bounds a long non-cyclical
 *  chain of distinct Cards each embedding the next. */
const MAX_EMBED_DEPTH = 4;

/** How long a touch has to hold before it counts as a long-press rather than a tap —
 *  same value and convention as Card.tsx's top-level equivalent. */
const LONG_PRESS_MS = 500;

interface CardEmbedProps {
  cardId: string;
  ancestorIds: ReadonlySet<string>;
  depth: number;
  /** Which embedded Cards are independently selected (App.tsx state) — see
   *  CardContent.tsx's doc comment. Several can be selected at once now, alongside
   *  top-level Cards and Quotes, all feeding the Dock's combined selection. Threaded
   *  through unchanged so a selection nested several embeds deep still resolves
   *  correctly. */
  selectedEmbedIds?: ReadonlySet<string>;
  onSelectEmbed?: (cardId: string, onRemove: () => void) => void;
  /** Double-click on desktop, long-press on touch (same convention as Card.tsx's
   *  top-level equivalent) — jumps straight into editing this embed: selects it and
   *  turns its edit mode on in one action, rather than requiring the Dock's Edit
   *  action as a separate step. */
  onRequestEditEmbed?: (cardId: string, onRemove: () => void) => void;
  /** Embedded Cards (any depth, any number) currently in their own inline edit mode
   *  (App.tsx state) — this embed is editable iff its own `cardId` is a member,
   *  regardless of whether an ancestor Card/embed is itself being edited or not:
   *  editing a Card no longer cascades into its embeds, and editing an embed doesn't
   *  require its ancestor to be editing either. Any combination is possible. */
  editingEmbedIds: ReadonlySet<string>;
  onToggleEmbedEdit: (cardId: string) => void;
  /** Forwarded unchanged to both this embed's own CardContent/CardContentEditor and
   *  every embed nested further inside it — see CardContent.tsx's doc comment. This
   *  embed's own diff/footnote/highlight overlays come from its own `useCard(cardId)`
   *  below (`card.metadata.annotations`), not a prop from its parent. */
  onRunProcess?: (cardId: string, process: AnnotationProcess, selectionText?: string) => void;
  onCreateManualHighlight?: (cardId: string, anchor: string, color: string) => void;
  onAcceptDiff?: (cardId: string, annotationId: string) => void;
  onRemoveAnnotation?: (cardId: string, annotationId: string) => void;
  onUpdateAnnotationText?: (cardId: string, annotationId: string, text: string) => void;
  /** Strips *this* embed's own `[[cardId]]` token out of its immediate parent's
   *  content — undefined only when there's nowhere to route a removal (no onSelectEmbed
   *  wired in from above). */
  onRemoveSelf?: () => void;
  /** "Turn into stack" (CardHeaderActions, below) succeeded — the new Stack Card's
   *  own id, which the caller (CardEmbedNodeView.tsx) repoints this embed's own
   *  `data-card-id` attr at, since CardEmbed itself has no ProseMirror node to
   *  update. Omitted wherever there's nowhere to route that repoint (e.g.
   *  DockCardView.tsx's own `hideHeader` usage, which never shows the button that
   *  would call this in the first place). */
  onConvertedToStack?: (newCardId: string) => void;
  /** Hides the header's collapse/expand caret entirely and always renders content in
   *  full. */
  hideFoldButton?: boolean;
  /** Suppresses this embed's own header (fold caret + title) entirely and always
   *  renders content in full — used by Dock.tsx's own inline single-card renderer
   *  (DockCardView.tsx), which supplies its own header instead (CardHeaderStart +
   *  CardHeaderActions, for real parity with a top-level Card's own header:
   *  title-only-when-folded, a real info flip, etc. — none of which this
   *  component's own bespoke header has, since a plain nested embed elsewhere in
   *  rich text doesn't need them). */
  hideHeader?: boolean;
}

/**
 * A `[[cardId]]` reference (lib/parseCardRefs.ts, inserted via CardLinkPicker.tsx)
 * rendered inline as the actual referenced Card, in full, always — same header/fold
 * chrome as a top-level Card (Card.tsx), never collapsed to a link/chip: viewing and
 * editing a Card look the same for anything embedded in it, just read-only vs.
 * editable.
 *
 * Reads and writes through the shared cardStore (useCard.ts) rather than its own
 * local state, so this Card stays in sync with *every* other place it's currently
 * shown — another embed of the same id elsewhere on the page, or the top-level
 * PageCard view if this Card is also open on a Page — the moment any one of them
 * edits it, not just on next reload. There's no page-local draft for an embed the
 * way there is for a PageCard: edits go straight to the vault.
 */
export function CardEmbed({
  cardId,
  ancestorIds,
  depth,
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
  onRemoveSelf,
  onConvertedToStack,
  hideFoldButton,
  hideHeader,
}: CardEmbedProps) {
  const circular = ancestorIds.has(cardId);
  const tooDeep = depth > MAX_EMBED_DEPTH;

  const { card, state } = useCard(cardId);
  const [folded, setFolded] = useState(false);
  const [showingInfo, setShowingInfo] = useState(false);
  const editing = editingEmbedIds.has(cardId);

  // Header actions (CardHeaderActions, below) — real parity with a top-level
  // Card's own header (Card.tsx), not this component's old bespoke fold+title
  // bar. "Turn into stack" has no PageCard to repoint the way a top-level Card's
  // own conversion does (stackService.convertCardToStack) — wrapCardInStack
  // wraps the Card by id directly and hands back a new Stack Card id, which
  // `onConvertedToStack` repoints this embed's own reference at (the original
  // Card is left untouched everywhere else it's shown or embedded).
  async function handleTurnIntoStack() {
    const newCard = await wrapCardInStack(cardId);
    onConvertedToStack?.(newCard.id);
  }

  async function handleSendToDock() {
    await addExistingCardToDock(cardId);
  }

  // Click-outside-to-close, same convention as Card.tsx's own inline editor: closes
  // just this embed's edit mode, leaving its ancestor(s) and any sibling embeds'
  // edit states untouched. Also excludes the Dock (see Card.tsx's identical guard) —
  // otherwise pointerdown on the Dock's own Edit/Save/Remove/Delete buttons for
  // *this* embed would close it before its onClick ever got to run.
  const containerRef = useDismiss<HTMLDivElement>(() => onToggleEmbedEdit(cardId), {
    enabled: editing,
    excludeSelector: ".dock",
    escape: false,
  });

  // Long-press-to-edit on touch devices, same convention as Card.tsx's top-level
  // equivalent — start a timer on touchstart, jump straight into editing if it's
  // still pressed LONG_PRESS_MS later, cancel on touchmove/touchend/touchcancel.
  // Every touch handler stops propagation regardless of whether this embed actually
  // supports the gesture (onRequestEditEmbed missing), so a press on a deeply
  // nested embed never also starts an ancestor embed's (or the top-level Card's)
  // own long-press timer.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchEndedAsLongPress = useRef(false);

  function clearLongPressTimer() {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleTouchStart(e: TouchEvent) {
    e.stopPropagation();
    touchEndedAsLongPress.current = false;
    clearLongPressTimer();
    if (!onRequestEditEmbed || !onRemoveSelf) return;
    longPressTimer.current = setTimeout(() => {
      touchEndedAsLongPress.current = true;
      onRequestEditEmbed(cardId, onRemoveSelf);
    }, LONG_PRESS_MS);
  }

  function handleTouchEnd(e: TouchEvent) {
    e.stopPropagation();
    clearLongPressTimer();
    if (touchEndedAsLongPress.current) {
      e.preventDefault();
    }
  }

  function handleTouchMove(e: TouchEvent) {
    e.stopPropagation();
    clearLongPressTimer();
  }

  function handleTouchCancel(e: TouchEvent) {
    e.stopPropagation();
    clearLongPressTimer();
  }

  if (circular) {
    return <span className="card-embed__inline-note">{t("card.embed.circular")}</span>;
  }
  if (tooDeep) {
    return <span className="card-embed__inline-note">{t("card.embed.tooDeep")}</span>;
  }
  if (state === "loading") {
    return <span className="card-embed__inline-note">{t("card.embed.loading")}</span>;
  }
  if (state === "error" || !card) {
    return <span className="card-embed__inline-note">{t("card.embed.notFound")}</span>;
  }

  const childAncestorIds = new Set([...ancestorIds, cardId]);
  // Selectable regardless of this embed's own edit state now — Dock actions (Edit,
  // Save, Remove, Delete) need to be reachable whether or not it's currently
  // editing, since Edit there is a toggle, not a one-way switch (see App.tsx's
  // toggleEditEmbed).
  const selectable = !!onSelectEmbed && !!onRemoveSelf;
  const isSelected = selectable && !!selectedEmbedIds?.has(cardId);
  const editableViaGesture = !!onRequestEditEmbed && !!onRemoveSelf;

  return (
    <div
      ref={containerRef}
      className={`card-shell card-embed${isSelected ? " card-shell--selected" : ""}`}
      // The whole box is the click/double-click/long-press target — not just the
      // header — and every handler here stops propagation, so a click anywhere
      // inside an embed (however deeply nested) always resolves to *that* embed,
      // never bubbling up to select/edit an ancestor embed or the top-level Card.
      onClick={
        selectable
          ? (e) => {
              e.stopPropagation();
              onSelectEmbed!(cardId, onRemoveSelf!);
            }
          : undefined
      }
      onDoubleClick={
        editableViaGesture
          ? (e) => {
              e.stopPropagation();
              onRequestEditEmbed!(cardId, onRemoveSelf!);
            }
          : undefined
      }
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchCancel={handleTouchCancel}
    >
      {hideHeader ? (
        // DockCardView.tsx's own usage — it supplies its own header (identical
        // CardHeaderStart + CardHeaderActions, wired to the Dock Card's own
        // actions) around this component, so this one stays fold-only, exactly
        // as before.
        (hideFoldButton || !folded) && (
          <CardRichText
            key={cardId}
            content={card.content}
            onChangeContent={(next) => editCard(cardId, { content: next })}
            editable={editing}
            cardId={cardId}
            annotations={card.metadata.annotations}
            ancestorIds={childAncestorIds}
            depth={depth + 1}
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
          />
        )
      ) : (
        // Real parity with a top-level Card's own header (Card.tsx): fold-caret
        // plus folded-only title (CardHeaderStart), turn-into-stack/send-to-
        // Dock/info-flip/close (CardHeaderActions) — same components, same
        // actions, not a smaller bespoke set. Title editing lives on the info
        // face now too (CardFlippableBody/CardInfoPanel), same as every other
        // CardType — this embed's own `editing` state (double-click/long-press)
        // now only ever governs whether the CONTENT itself is editable.
        <>
          <div className="card__header">
            <CardHeaderStart title={card.title} collapsed={folded} onToggleCollapsed={() => setFolded((f) => !f)} />
            <CardHeaderActions
              onTurnIntoStack={getCardTypeId(card) === "stack" ? undefined : handleTurnIntoStack}
              onSendToDock={handleSendToDock}
              showingInfo={showingInfo}
              onToggleInfo={() => setShowingInfo((v) => !v)}
              onRemove={() => onRemoveSelf?.()}
            />
          </div>
          {!folded && (
            <CardFlippableBody
              card={card}
              showingInfo={showingInfo}
              onChangeTitle={(title) => editCard(cardId, { title })}
            >
              <CardRichText
                key={cardId}
                content={card.content}
                onChangeContent={(next) => editCard(cardId, { content: next })}
                editable={editing}
                cardId={cardId}
                annotations={card.metadata.annotations}
                ancestorIds={childAncestorIds}
                depth={depth + 1}
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
              />
            </CardFlippableBody>
          )}
        </>
      )}
    </div>
  );
}

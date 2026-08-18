import { useEffect, useState } from "react";
import { CardRichText } from "../../richtext/CardRichText.js";
import { GhostCard } from "../../GhostCard.js";
import { FeedInputButton } from "../../../FeedInputButton/FeedInputButton.js";
import { CardStackRail } from "../../../CardStack/CardStackRail.js";
import { useCardStack } from "../../../../hooks/useCardStack.js";
import { useGeneration } from "../../../../hooks/useGeneration.js";
import { getActiveStackControls, setActiveStackControls } from "../../../../lib/activeStackRegistry.js";
import { CardCaretButton } from "../../CardHeaderStart.js";
import { CardHeaderActions } from "../../CardHeaderActions.js";
import { CardFlippableBody } from "../../CardFlippableBody.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";

/**
 * The "stack" CardType's actual content — the currently active member's own title +
 * rich text, always directly editable in place, exactly like a plain note Card.
 * CardStackRail (← / n-of-m / +) tucks into the top-right corner of the same
 * .card__header row the title already occupies (Card.css's space-between slot)
 * rather than a bar of its own — and while
 * there's only one member, it's just the "+" (see CardStackRail.tsx): a Stack that
 * hasn't actually branched yet should read as a plain Card. A member has no
 * separate "edit mode" of its own to enter — same
 * "writes straight through" precedent embeds and Dock Cards already use — except it
 * *does* still stage unsaved drafts (useCardStack.ts) until explicitly saved, since,
 * unlike an embed, a fresh member starts out as page-local scratch content, not yet a
 * vault Card. Shared by both StackView.tsx and StackEditor.tsx: the container itself
 * has nothing that meaningfully differs between "selected" and "selected + editing",
 * so both just render this.
 *
 * Fold/collapse (Card.tsx's own `collapsed` state/caret) works the same way here:
 * the header (caret, title, rail) always stays visible, only the body underneath —
 * whichever of GhostCard/FeedInputButton/CardRichText below is currently showing —
 * folds away.
 *
 * Card design pass: the header shows the active alternate's title only while
 * folded (same "no title when expanded" rule every other CardType's header now
 * follows) — renaming happens on the Info face instead (CardInfoPanel's own
 * onChangeTitle, wired here to `stack.updateActiveDraft`). "Turn into stack" is the
 * one CardHeaderActions action deliberately left out: a Stack already has its own
 * way to add an alternate (CardStackRail's own "+"). Send to Dock is included like
 * every other CardType, though — a Stack Card is still a perfectly good thing to
 * park in the Dock as a whole. The header bar itself
 * (`.card__header`, click anywhere) toggles the container's own selection in/out —
 * same skinny-header-is-the-hit-target convention every other CardType's header
 * uses now, no checkbox. `onRemove` closes the whole Stack (App.tsx's
 * handleRequestRemovePageCard already special-cases a Stack Card to close as a
 * unit, promoting any unsaved member to the vault first) — the header's own "X",
 * same as every other CardType, not just the Dock's bulk action any more.
 *
 * A blank alternate (added via the rail's "+", never touched since) shows its own
 * Feed Input Button — Generate + a typed guide, same as a blank Page — instead of
 * the plain title/body editor, so a fresh alternate can be filled by AI in place, not
 * just typed by hand. Its own useGeneration() instance (not App.tsx's page-level
 * one — this fills the alternate's own content, it doesn't insert a sibling
 * PageCard) streams into a GhostCard exactly like a Page-level generation does; the
 * rail locks (CardStackRail's `disabled`) for the duration so the active member
 * can't change out from under it mid-stream. The Dock's own "Generate" action, while
 * a Stack is selected, drives the exact same instance (via generateNewAlternate
 * below): it appends a fresh blank alternate and starts generating into *that*,
 * rather than App.tsx's page-level Generate inserting a sibling Card the way
 * selecting any other Card would.
 */
export function StackBody({
  stackCardId,
  selected,
  onSelect,
  onRemove,
  onSendToDock,
}: {
  stackCardId: string;
  selected: boolean;
  /** The header bar's own click-to-select — see CardHeaderStart.tsx's own doc
   *  comment on the equivalent CardTypeViewProps.onSelect every other CardType's
   *  header now uses the same way. Optional/inert when absent — StackEditor.tsx
   *  has no such callback to give it (CardTypeEditorProps has no onSelect at all;
   *  that render path is only ever reached for a Stack that's already selected,
   *  with no in-editor way to deselect today). */
  onSelect?: () => void;
  /** The header's "X" — see Card.tsx's own onRemove prop of the same name;
   *  StackView/StackEditor forward this down from the generic CardTypeUi props
   *  (registries/cardTypeUi.ts). Optional/omitted by StackEditor, same reasoning
   *  as onSelect above. */
  onRemove?: () => void;
  /** The header's down-arrow — see Card.tsx's own onSendToDock prop of the same
   *  name. Optional/omitted by StackEditor, same reasoning as onSelect above. */
  onSendToDock?: () => void;
}) {
  const stack = useCardStack(stackCardId);
  const data = stack.data;
  const active = data && data.members.length > 0 ? data.members[data.activeIndex] : undefined;
  // No title required to save (a Card — including a Stack alternate — can have no
  // title by default; see cardService.createCard's own doc comment).
  const hasUnsavedDraft =
    !!active && (active.draftTitle !== null || active.draftContent !== null || !active.card.savedToVault);
  const generation = useGeneration(stack.refresh);
  // Purely a display preference, not app state — same "doesn't need to be lifted"
  // reasoning as Card.tsx's own `collapsed`.
  const [collapsed, setCollapsed] = useState(false);
  // Same "flip to a read-only info back-face" mechanic Card.tsx's own note render
  // uses — flips to the *active alternate's* own Card, matching whatever's actually
  // in view, not the container "stack"-typed Card itself.
  const [showingInfo, setShowingInfo] = useState(false);

  async function generateNewAlternate() {
    const created = await stack.addMember();
    generation.startForStackMember(created.id);
  }

  useEffect(() => {
    if (!selected || !active) return;
    setActiveStackControls({
      stackCardId,
      hasUnsavedDraft,
      save: () => stack.saveActive(),
      remove: () => stack.removeActive(),
      isGenerating: generation.isStreaming,
      generateNewAlternate,
      stopGenerating: generation.stop,
    });
    return () => {
      if (getActiveStackControls()?.stackCardId === stackCardId) {
        setActiveStackControls(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, stackCardId, active, hasUnsavedDraft, generation.isStreaming]);

  if (stack.loading || !data || !active) {
    return null;
  }

  const title = active.draftTitle ?? active.card.title;
  const content = active.draftContent ?? active.card.content;
  const isBlank =
    active.card.title === "" &&
    active.card.content === "" &&
    active.draftTitle === null &&
    active.draftContent === null;

  return (
    <>
      <div className="card__header" onClick={onSelect}>
        <div className="card__header-start">
          <CardCaretButton collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
          {collapsed && title && <span className="card__title">{title}</span>}
        </div>
        <CardStackRail
          index={data.activeIndex}
          total={data.members.length}
          atStart={data.activeIndex === 0}
          atEnd={data.activeIndex === data.members.length - 1}
          onPrevious={stack.goPrevious}
          onNext={stack.goNext}
          onAdd={stack.addMember}
          disabled={generation.isStreaming}
        />
        <CardHeaderActions
          showingInfo={showingInfo}
          onToggleInfo={() => setShowingInfo((v) => !v)}
          onSendToDock={onSendToDock}
          onRemove={() => onRemove?.()}
        />
      </div>
      {!collapsed && (
        <CardFlippableBody
          card={active.card}
          showingInfo={showingInfo}
          onChangeTitle={(title) => stack.updateActiveDraft({ title })}
        >
          {generation.isStreaming && generation.rootId !== null ? (
            <GhostCard nodeId={generation.rootId} nodes={generation.nodes} />
          ) : isBlank ? (
            <FeedInputButton
              generating={generation.isStreaming}
              onStopGeneration={generation.stop}
              onGenerate={(instruction) => generation.startForStackMember(active.id, instruction)}
              onAddCard={(next) => stack.updateActiveDraft({ content: next })}
              showMoreOptions={false}
              placeholder={t("feedInput.placeholder")}
            />
          ) : (
            <CardRichText
              content={content}
              onChangeContent={(next) => stack.updateActiveDraft({ content: next })}
              editable
              cardId={active.card.id}
              ancestorIds={new Set([active.card.id, stackCardId])}
              depth={0}
            />
          )}
        </CardFlippableBody>
      )}
    </>
  );
}

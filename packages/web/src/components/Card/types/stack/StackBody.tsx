import { useEffect, useState } from "react";
import { Icon, InputField } from "../../../primitives/index.js";
import { CardRichText } from "../../richtext/CardRichText.js";
import { GhostCard } from "../../GhostCard.js";
import { FeedInputButton } from "../../../FeedInputButton/FeedInputButton.js";
import { CardStackRail } from "../../../CardStack/CardStackRail.js";
import { useCardStack } from "../../../../hooks/useCardStack.js";
import { useGeneration } from "../../../../hooks/useGeneration.js";
import { getActiveStackControls, setActiveStackControls } from "../../../../lib/activeStackRegistry.js";
import { CardHeaderActions } from "../../CardHeaderActions.js";
import { CardSelectButton } from "../../CardHeaderStart.js";
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
 * Save for the active alternate also lives in the Dock (Dock.tsx's isStackSelected
 * row) — this still publishes the same callback it needs (activeStackRegistry.ts)
 * while `selected` is true — but the header's own CardHeaderActions row now offers
 * the same save/open-in-vault/fullscreen/info actions inline too, same as every other
 * CardType's View. "Turn into stack" is the one action deliberately left out: a Stack
 * already has its own way to add an alternate (CardStackRail's own "+"). The
 * header's own select-checkbox (CardSelectButton — the same one CardHeaderStart.tsx
 * uses for every other CardType, just placed inline here since a Stack's own title
 * is a genuinely editable input rather than that shared component's plain read-only
 * span) toggles the container's own selection in/out; removing the whole Stack from
 * the Page is the Dock's bulk "Remove" action (App.tsx's handleRemoveSelected).
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
  onOpenFullscreen,
  onOpenInVault,
}: {
  stackCardId: string;
  selected: boolean;
  /** The header's own select-checkbox — see CardHeaderStart.tsx's own doc comment
   *  on the equivalent prop every other CardType's View passes straight through
   *  from CardTypeViewProps.onSelect. Optional/omits the checkbox entirely when
   *  absent — StackEditor.tsx has no such callback to give it (CardTypeEditorProps
   *  has no onSelect at all; that render path is only ever reached for a Stack
   *  that's already selected, with no in-editor way to deselect today). */
  onSelect?: () => void;
  /** The header's "expand" corner button — see Card.tsx's own prop of the same
   *  name; StackView/StackEditor forward this down from the generic CardTypeUi
   *  props (registries/cardTypeUi.ts). */
  onOpenFullscreen?: () => void;
  /** The header's Save button once the active alternate has nothing left to save —
   *  opens the Vault panel searching for it (App.tsx's handleOpenCardInVault, same
   *  as Card.tsx's own onOpenInVault). Saving itself still goes through
   *  useCardStack's own saveActive below, not this — a Stack's own PageCard row
   *  never carries a draft, only its active member does. */
  onOpenInVault?: (title: string) => void;
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
            <Icon name="down" className={`card__caret${collapsed ? " card__caret--collapsed" : ""}`} />
          </button>
          {onSelect && <CardSelectButton selected={selected} onSelect={onSelect} />}
          <InputField
            className="card__title-input"
            value={title}
            placeholder={t("card.titlePlaceholder")}
            onChange={(e) => stack.updateActiveDraft({ title: e.target.value })}
            // Clicking into the title to place the cursor (or drag-selecting its
            // text to retype it) shouldn't also select/deselect this Stack — same
            // belt-and-suspenders reasoning CardEmbed.tsx's own title input uses,
            // even though selection is only ever the checkbox now (CardShell no
            // longer has an onSelect of its own to accidentally trigger either).
            onClick={(e) => e.stopPropagation()}
          />
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
          hasUnsavedChanges={hasUnsavedDraft}
          onSave={() => stack.saveActive()}
          onOpenInVault={() => onOpenInVault?.(active.card.title)}
          onOpenFullscreen={onOpenFullscreen}
          showingInfo={showingInfo}
          onToggleInfo={() => setShowingInfo((v) => !v)}
        />
      </div>
      {!collapsed && (
        <CardFlippableBody card={active.card} showingInfo={showingInfo}>
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

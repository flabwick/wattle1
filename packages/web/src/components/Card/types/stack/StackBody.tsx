import { useEffect, useState } from "react";
import { Button, Icon, InputField } from "../../../primitives/index.js";
import { CardRichText } from "../../richtext/CardRichText.js";
import { GhostCard } from "../../GhostCard.js";
import { FeedInputButton } from "../../../FeedInputButton/FeedInputButton.js";
import { CardStackRail } from "../../../CardStack/CardStackRail.js";
import { useCardStack } from "../../../../hooks/useCardStack.js";
import { useGeneration } from "../../../../hooks/useGeneration.js";
import { getActiveStackControls, setActiveStackControls } from "../../../../lib/activeStackRegistry.js";
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
 * Save for the active alternate lives in the Dock, not as an inline button here
 * (Dock.tsx's isStackSelected row) — this only publishes the callback it needs
 * (activeStackRegistry.ts) while `selected` is true. A tap toggles the container's
 * own selection in/out (StackView.tsx's onClick); removing the whole Stack from the
 * Page is the Dock's bulk "Remove" action
 * (App.tsx's handleRemoveSelected).
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
  onOpenFullscreen,
}: {
  stackCardId: string;
  selected: boolean;
  /** The header's "expand" corner button — see Card.tsx's own prop of the same
   *  name; StackView/StackEditor forward this down from the generic CardTypeUi
   *  props (registries/cardTypeUi.ts). */
  onOpenFullscreen?: () => void;
}) {
  const stack = useCardStack(stackCardId);
  const data = stack.data;
  const active = data && data.members.length > 0 ? data.members[data.activeIndex] : undefined;
  // Same title-required gate as the Dock's own hasUnsavedDraft (stackService.
  // saveMemberToVault rejects a blank title) — an untitled alternate isn't
  // "ready to save" yet.
  const hasUnsavedDraft =
    !!active &&
    (active.draftTitle !== null || active.draftContent !== null || !active.card.savedToVault) &&
    (active.draftTitle ?? active.card.title).trim() !== "";
  const generation = useGeneration(stack.refresh);
  // Purely a display preference, not app state — same "doesn't need to be lifted"
  // reasoning as Card.tsx's own `collapsed`.
  const [collapsed, setCollapsed] = useState(false);

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
          <InputField
            className="card__title-input"
            value={title}
            placeholder={t("card.titlePlaceholder")}
            onChange={(e) => stack.updateActiveDraft({ title: e.target.value })}
            // Clicking into the title to place the cursor (or drag-selecting its
            // text to retype it) shouldn't also toggle this Stack's own Dock
            // selection — an <input> is already excluded from StackView.tsx's
            // outer CardShell select gesture (useCardSelectGesture.ts), this is
            // just belt-and-suspenders, same as CardEmbed.tsx's own title input.
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
        <div className="card__header-actions">
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
      </div>
      {!collapsed &&
        (generation.isStreaming && generation.rootId !== null ? (
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
        ))}
    </>
  );
}

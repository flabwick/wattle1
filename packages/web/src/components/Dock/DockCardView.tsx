import { useState } from "react";
import type { DockCardWithCard } from "@wattle/shared";
import { CardHeaderStart } from "../Card/CardHeaderStart.js";
import { CardHeaderActions } from "../Card/CardHeaderActions.js";
import { CardFlippableBody } from "../Card/CardFlippableBody.js";
import { CardEmbed } from "../Card/CardEmbed.js";
import { GhostCard } from "../Card/GhostCard.js";
import { FeedInputButton } from "../FeedInputButton/FeedInputButton.js";
import { useCard } from "../../hooks/useCard.js";
import { editCard } from "../../lib/cardStore.js";
import { getCardTypeId } from "../../lib/getCardTypeId.js";
import type { GhostCardNode } from "../../hooks/useGeneration.js";
import { t } from "../../i18n/index.js";
import "../Card/Card.css";

const EMPTY_ANCESTOR_IDS: ReadonlySet<string> = new Set();

interface DockCardViewProps {
  dockCard: DockCardWithCard;
  selected: boolean;
  onSelect: () => void;
  /** The header's up-arrow — lands this Card at the bottom of the current Page
   *  immediately (App.tsx's handleSendDockCardToPage) — no destination to pick. */
  onSendToPage: () => void;
  /** The header's "X" — App.tsx's handleCloseDockCard (unpins from the Dock if
   *  already saved to the vault, deletes outright otherwise — same semantics the
   *  old selectedDockCardIds-driven Close action already had). */
  onClose: () => void;
  /** The header's "+" — turns this Dock Card's own Card into a Stack in place
   *  (App.tsx's handleTurnDockCardIntoStack), same "+", same underlying
   *  stackService shape, as a Page Card's own turn-into-stack. */
  onTurnIntoStack: () => void;
  editingEmbedIds: ReadonlySet<string>;
  onToggleEmbedEdit: (cardId: string) => void;
  /** True while App.tsx's own Dock-generation useGeneration instance is streaming
   *  into *this* Dock Card — only ever true for the one Dock Card currently in view
   *  (Dock.tsx locks navigation for the duration, same as CardStackRail's own
   *  `disabled` during a Stack alternate's generation), so there's no ambiguity
   *  about which Card it belongs to. */
  generating: boolean;
  generationNodes: Record<number, GhostCardNode>;
  generationRootId: number | null;
  /** Starts a generation that fills this Dock Card's own content in place — only
   *  ever called while `isBlank` (see below), same as a blank Stack alternate's own
   *  Feed Input Button. */
  onGenerate: (instruction?: string) => void;
  onStopGeneration: () => void;
}

/**
 * One Card in the Dock's own scrollable list, rendered directly inline (one row
 * per Dock Card, however many there are) rather than behind a slide-up menu/panel
 * with left-right navigation between them. Mirrors a top-level Page Card's own
 * header exactly (CardHeaderStart + CardHeaderActions +
 * CardFlippableBody, all reused as-is): the title shows only while folded, an
 * expanded Card shows none (Card design pass' own rule, same as Card.tsx), and
 * the info flip works the same way too. Content itself is CardEmbed's own
 * (`hideHeader` — suppresses its bespoke header/fold entirely and always renders
 * content in full, since folding is owned here instead), which is what already
 * gives a Dock Card its "writes straight through, no draft" behavior — same as
 * before the Dock's single-slot redesign (since reversed — the Dock holds as many
 * Cards as added again), just with a real header wrapped around it now. "+" (turn
 * into stack) is omitted once the Card already IS a Stack, same as a Page Card's
 * own StackView never getting the button in the first place — turning a Stack
 * into a Stack of Stacks doesn't mean anything.
 *
 * A brand-new Dock Card (created via Dock.tsx's own "+", at the end of the carousel
 * — same rail convention as CardStackRail) starts out blank, same criteria as a
 * Stack alternate's own isBlank (StackBody.tsx): no title, no content. While blank,
 * the body swaps to a Feed Input Button — Generate + a typed guide, same as a blank
 * Page/Stack alternate — instead of the plain CardEmbed, so it can be filled by AI
 * in place, not just typed by hand. Once it has real content (either way), it just
 * renders like any other Dock Card from then on.
 */
export function DockCardView({
  dockCard,
  selected,
  onSelect,
  onSendToPage,
  onClose,
  onTurnIntoStack,
  editingEmbedIds,
  onToggleEmbedEdit,
  generating,
  generationNodes,
  generationRootId,
  onGenerate,
  onStopGeneration,
}: DockCardViewProps) {
  const { card: liveCard } = useCard(dockCard.cardId);
  const canonicalCard = liveCard ?? dockCard.card;
  const [collapsed, setCollapsed] = useState(false);
  const [showingInfo, setShowingInfo] = useState(false);
  const isStack = getCardTypeId(canonicalCard) === "stack";
  const isBlank = canonicalCard.title === "" && canonicalCard.content === "";

  return (
    <div className={`card-shell${selected ? " card-shell--selected" : ""}`}>
      <div className="card__header" onClick={onSelect}>
        <CardHeaderStart title={canonicalCard.title} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((c) => !c)} />
        <CardHeaderActions
          onTurnIntoStack={isStack ? undefined : onTurnIntoStack}
          onSendToPage={onSendToPage}
          showingInfo={showingInfo}
          onToggleInfo={() => setShowingInfo((v) => !v)}
          onRemove={onClose}
        />
      </div>
      {!collapsed && (
        <CardFlippableBody
          card={canonicalCard}
          showingInfo={showingInfo}
          onChangeTitle={(title) => editCard(dockCard.cardId, { title })}
        >
          {generating && generationRootId !== null ? (
            <GhostCard nodeId={generationRootId} nodes={generationNodes} />
          ) : isBlank ? (
            <FeedInputButton
              generating={generating}
              onStopGeneration={onStopGeneration}
              onGenerate={onGenerate}
              onAddCard={(content) => editCard(dockCard.cardId, { content })}
              showMoreOptions={false}
              placeholder={t("feedInput.placeholder")}
            />
          ) : (
            <CardEmbed
              cardId={dockCard.cardId}
              ancestorIds={EMPTY_ANCESTOR_IDS}
              depth={0}
              hideHeader
              editingEmbedIds={editingEmbedIds}
              onToggleEmbedEdit={onToggleEmbedEdit}
              onRequestEditEmbed={(cardId) => onToggleEmbedEdit(cardId)}
              onRemoveSelf={() => {}}
            />
          )}
        </CardFlippableBody>
      )}
    </div>
  );
}

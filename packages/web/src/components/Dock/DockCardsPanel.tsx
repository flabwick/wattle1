import { useEffect, useState } from "react";
import type { DockCardWithCard } from "@wattle/shared";
import { Icon } from "../primitives/index.js";
import { CardEmbed } from "../Card/CardEmbed.js";
import { FeedInputButton } from "../FeedInputButton/FeedInputButton.js";
import { t } from "../../i18n/index.js";
import "./DockCardsPanel.css";

interface DockCardsPanelProps {
  dockCards: DockCardWithCard[];
  editingIds: ReadonlySet<string>;
  onToggleEdit: (cardId: string) => void;
  /** The same select-then-act model Page Cards use (see App.tsx's
   *  selectedDockCardIds) — Edit/Save/Move to Page/Close for the selection live in
   *  the Dock's own action row, matching what a selected Page Card gets; tapping the
   *  Card here just toggles its membership. */
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (dockCardId: string) => void;
  onCreateCard: (title: string, content: string) => void;
  /** The creation flow's own Open from Vault (FeedInputButton, showGenerate false) —
   *  switches straight to the Vault panel, same as a Page's own Feed Input Button;
   *  the vault card actually lands in the Dock afterward the same way it already
   *  does from anywhere else (Dock.tsx's onAddVaultCardToDock, selecting a vault
   *  Card and tapping the Dock Cards toggle). */
  onOpenVault: () => void;
  /** The creation flow's own Upload — mirrors a Page's Feed Input Button Upload, but
   *  returns the created DockCard so this panel can jump straight to it. */
  onUploadFile: (file: File) => Promise<DockCardWithCard>;
  /** Non-null right after a Card lands in the Dock from elsewhere (App.tsx's
   *  dockCardToOpen — moved from a Page, or added from the Vault) — jumps straight
   *  to it in the single-card view the moment it shows up in `dockCards`, then fires
   *  onOpenedCard so the parent can clear this back to null. */
  openCardId: string | null;
  onOpenedCard: () => void;
}

/** Which of the panel's three mutually-exclusive states is showing — never the list
 *  and a Card's actual content at once ("shouldn't show the options AND the actual
 *  dock card, it takes too much space"). */
type View = "menu" | "card" | "creating";

/**
 * The Dock Card panel (Step 6 spec §3.3, reworked) — the extended panel shown when
 * the Dock Cards toggle in the base bar is tapped. Opens on a selection menu (a plain
 * list of every Dock Card); tapping one switches to a single-card view with left/
 * right arrows to step to the adjacent Card. These two views are mutually exclusive —
 * the menu never shows alongside a Card's content, and vice versa.
 *
 * Rendered via CardEmbed since a Dock Card has no draft-staging concept of its own,
 * just like an embedded Card — edits write straight through. Tapping the Card toggles
 * its selection (driving the Dock's own Edit/Save/Move to Page/Close row, same as a
 * selected Page Card); double-click/long-press jumps straight into editing it instead,
 * same fast-path any other embed gets — same as its edit state on a Page, with no
 * extra chrome of its own (CardEmbed's hideFoldButton: there's no local collapse
 * toggle needed for the one Card that's the entire screen). Folding the whole panel
 * back to the Dock's default state is the base bar's own Dock Cards toggle's job, not
 * this panel's.
 *
 * Creating a new one (the menu's own "+" row) reuses the Page's own Feed Input
 * Button (showGenerate false — Dock Cards have no Page/Tab to draw generation
 * context from): Add creates straight from whatever's typed, blank otherwise; the
 * ellipsis opens the same small popup a Page's does for Open from Vault/Upload/type.
 * Whichever way it happens, the new Card opens straight into the single-card view.
 */
export function DockCardsPanel({
  dockCards,
  editingIds,
  onToggleEdit,
  selectedIds,
  onToggleSelect,
  onCreateCard,
  onOpenVault,
  onUploadFile,
  openCardId,
  onOpenedCard,
}: DockCardsPanelProps) {
  const [view, setView] = useState<View>("menu");
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!openCardId) return;
    const index = dockCards.findIndex((dc) => dc.id === openCardId);
    if (index === -1) return;
    setCurrentIndex(index);
    setView("card");
    onOpenedCard();
  }, [openCardId, dockCards, onOpenedCard]);

  // dockCardService.createCardInDock/addFileCardToDock both always append — the new
  // Card lands at the end, so open straight into it once the list refetches.
  function landOnNewCard() {
    setCurrentIndex(dockCards.length);
    setView("card");
  }

  function handleAddCard(content: string) {
    onCreateCard(t("common.untitled"), content);
    landOnNewCard();
  }

  async function handleUploadFile(file: File) {
    await onUploadFile(file);
    landOnNewCard();
  }

  if (view === "creating") {
    return (
      <div className="dock-cards-panel">
        <FeedInputButton
          showGenerate={false}
          generating={false}
          onStopGeneration={() => {}}
          onGenerate={() => {}}
          onAddCard={handleAddCard}
          onOpenVault={onOpenVault}
          onUploadFile={handleUploadFile}
          placeholder={t("dockCards.newCardPlaceholder")}
        />
      </div>
    );
  }

  if (view === "menu") {
    return (
      <div className="dock-cards-panel">
        <div className="dock-cards-panel__menu">
          {dockCards.length === 0 && (
            <p className="dock-cards-panel__empty">{t("dockCards.empty")}</p>
          )}
          {dockCards.map((dc, index) => (
            <button
              key={dc.id}
              type="button"
              className={`dock-cards-panel__menu-item${index === currentIndex ? " dock-cards-panel__menu-item--current" : ""}`}
              onClick={() => {
                setCurrentIndex(index);
                setView("card");
              }}
            >
              {dc.card.title || t("common.untitled")}
            </button>
          ))}
          <button
            type="button"
            className="dock-cards-panel__menu-add"
            onClick={() => setView("creating")}
          >
            <Icon name="plus" />
            {t("feedInput.add")}
          </button>
        </div>
      </div>
    );
  }

  // view === "card" — clamped since Dock Cards can be added/removed out from under
  // whatever index was last navigated to.
  const clampedIndex = Math.min(currentIndex, Math.max(0, dockCards.length - 1));
  const current = dockCards[clampedIndex] ?? null;
  const editing = current ? editingIds.has(current.cardId) : false;

  return (
    <div className="dock-cards-panel">
      {current ? (
        <div className="dock-cards-panel__card-row">
          <button
            type="button"
            className="dock-cards-panel__nav"
            disabled={clampedIndex <= 0}
            onClick={() => setCurrentIndex(clampedIndex - 1)}
            aria-label={t("dockCards.previous")}
            title={t("dockCards.previous")}
          >
            <Icon name="back" />
          </button>
          <div
            className={`dock-cards-panel__item${selectedIds.has(current.id) ? " dock-cards-panel__item--selected" : ""}`}
            // Only toggles selection while *not* editing — CardEmbed's own root has
            // no onClick of its own for this (we don't pass onSelectEmbed, a separate
            // concept for embeds nested *within* a Dock Card's own content), so a
            // click into its textarea to place the cursor would otherwise bubble
            // straight up to this wrapper and toggle selection on every click.
            onClick={editing ? undefined : () => onToggleSelect(current.id)}
          >
            <CardEmbed
              key={current.cardId}
              cardId={current.cardId}
              ancestorIds={new Set()}
              depth={0}
              editingEmbedIds={editingIds}
              onToggleEmbedEdit={onToggleEdit}
              onRequestEditEmbed={(cardId) => onToggleEdit(cardId)}
              onRemoveSelf={() => {}}
              hideFoldButton
            />
          </div>
          <button
            type="button"
            className="dock-cards-panel__nav"
            disabled={clampedIndex >= dockCards.length - 1}
            onClick={() => setCurrentIndex(clampedIndex + 1)}
            aria-label={t("dockCards.next")}
            title={t("dockCards.next")}
          >
            <Icon name="chevronRight" />
          </button>
        </div>
      ) : (
        <p className="dock-cards-panel__empty">{t("dockCards.empty")}</p>
      )}
    </div>
  );
}

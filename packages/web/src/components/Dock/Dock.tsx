import { useEffect, useRef, useState } from "react";
import type { Card, DockCardWithCard, Folder, FolderContents, PageCardWithCard, PageWithCards, Tab } from "@wattle/shared";
import { cardTypeRegistry, operationRegistry } from "@wattle/shared";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import type { AnnotationProcess } from "../../api/client.js";
import { Button, Icon } from "../primitives/index.js";
import type { IconName } from "../primitives/Icon.js";
import { VaultView } from "../Vault/VaultView.js";
import { DockCardsPanel } from "./DockCardsPanel.js";
import { PagesPanel } from "./PagesPanel.js";
import { TabsPanel } from "./TabsPanel.js";
import { ProcessPicker } from "./ProcessPicker.js";
import { getCardTypeId } from "../../lib/getCardTypeId.js";
import { useActiveEditor } from "../../lib/activeEditorRegistry.js";
import { t } from "../../i18n/index.js";
import "./Dock.css";

/** The three extended-panel views (Step 6 spec §3.2) — Tabs is a later step. Only one
 *  is ever open at once, lifted to App.tsx as a single `openPanel` value rather than
 *  independent booleans so that's structurally guaranteed, not just convention. */
export type DockPanel = "vault" | "dockCards" | "pages" | "tabs";

interface DockProps {
  /** The single currently-selected Card, if any — only ever one Page Card selected
   *  at a time (App.tsx's toggleSelectPageCard replaces rather than adds to the
   *  selection). Still an array since most of this file's logic was written
   *  batch-shaped and works fine unchanged over 0-1 items. Empty when nothing's
   *  selected. */
  selectedCards: PageCardWithCard[];
  /** An independently-selected embedded Card's id (mutually exclusive with, and takes
   *  priority over, `selectedCards` — see App.tsx/CardContent.tsx). Gets the same
   *  back-caret/Edit/Save/Move/Move to Dock actions a top-level Card does, plus
   *  Remove/Delete which only an embed has — Save is always shown already-done
   *  since embeds are always already-saved vault Cards (CardLinkPicker only offers
   *  saved ones) that write straight through on every keystroke, so there's never
   *  anything pending to commit. There's no per-embed Generate: Generate is only
   *  ever available via `selectedCards` below. Tapping an already-selected embed
   *  again jumps into editing it rather than deselecting (App.tsx's selectEmbed) —
   *  onDeselectEmbed below is the only way back out. */
  selectedEmbedId: string | null;
  /** True while whatever's selected (Page Card, Dock Card, or embed) is also in its
   *  own inline edit mode — swaps the row for the rich-text formatting toolbar
   *  (bold/italic/heading/lists), replacing Move/Save/Generate/etc. for as long as
   *  editing is active (App.tsx derives this from editingPageCardIds/editingEmbedIds,
   *  no new state of its own). */
  isEditingActive: boolean;
  onRemoveEmbed: () => void;
  onDeleteEmbed: () => void;
  /** The row's own back-caret action — a plain deselect, leaving the embed exactly
   *  where it is (distinct from Remove/Delete above, which are their own explicit
   *  actions further along the row). */
  onDeselectEmbed: () => void;
  /** Move Mode for the selected embed (App.tsx's movingEmbedCard) — true while it's
   *  in transit to a Page position. Same in-transit-waiting-for-a-drop-zone shape as
   *  `moving`/`dockCardMoving`, kept as its own flag for the same reason
   *  dockCardMoving is: never simultaneously true with the others (selection is
   *  already mutually exclusive across Page Cards/Dock Cards/embeds). */
  embedMoving: boolean;
  onEnterEmbedMoveMode: () => void;
  onCancelEmbedMove: () => void;
  onMoveEmbedToDock: () => void;
  /** Set once a generation stream ends in an error (bad credentials, network failure,
   *  malformed model output — see useGeneration.ts) rather than a valid root card.
   *  Shown as a dismissible banner instead of silently doing nothing. */
  generationError: string | null;
  onDismissGenerationError: () => void;
  /** A one-time, non-error notice after a generation lands that wasn't a clean finish
   *  — cut off by the model's token limit, or ended early via the Stop action (see
   *  useGeneration.ts's `notice`). Dismissible, same as the error banners, but styled
   *  neutrally rather than as a danger/error. */
  generationNotice: string | null;
  onDismissGenerationNotice: () => void;
  /** Set when a diff/footnote/highlight run, or an accept/reject/edit-text action,
   *  fails (useAnnotations.ts's `error`) — same dismissible-banner convention as
   *  generationError above, kept as its own prop rather than merged with it since
   *  they're two independent features that can each be mid-action at once. */
  annotationError: string | null;
  onDismissAnnotationError: () => void;
  /** Saves every selected Card that has something pending — a no-op for any that
   *  don't (App.tsx batches the existing per-Card save-to-vault call). */
  onSaveSelected: () => void;
  /** True from the moment a generation starts until it's fully saved — the Circle
   *  becomes a Stop action while this is true, same convention as the Feed Input
   *  Button's own Circle (FeedInputButton.tsx). */
  generating: boolean;
  onStopGeneration: () => void;
  /** Generate anchored to the selection (Step 6 spec §4.2) rather than the bottom of
   *  the Page — inserts directly below whichever selected Card sorts last (App.tsx
   *  picks the bottommost one as the anchor when more than one is selected). */
  onGenerateSelected: () => void;
  /** The diff/footnote/highlight processes (a separate, parallel system from
   *  Generate — see annotationService.ts) — null whenever there's no Card/embed
   *  context to run one against, including when more than one Card is selected at
   *  once (App.tsx only resolves this for a single selected Card — annotations
   *  running across a multi-selection isn't a case Step 6 defines). Runs against the
   *  *whole* selected Card (root + any nested Cards); a text-selection-scoped run
   *  instead goes through SelectionMenu.tsx directly, not through the Dock at all. */
  onRunProcess: ((process: AnnotationProcess) => void) | null;
  /** True while a process run is streaming/awaiting its model response — disables
   *  the action and spins its icon, same convention as `generating` above. */
  processRunning: boolean;
  /** How many pending diff annotations the selected Card/embed currently has — the
   *  "Accept all diffs" action only appears once this is > 0. */
  pendingDiffCount: number;
  onAcceptAllDiffs: (() => void) | null;
  /** Deselects every selected Card — the row's own back-caret action. Pure
   *  deselect: every Card stays right where it is on the Page. Tapping an
   *  already-selected Card jumps into editing it instead of deselecting
   *  (App.tsx's toggleSelectPageCard) — this is the only way back out. */
  onDeselectAll: () => void;
  /** Moves every selected Card off its Page and onto the Dock's persistent
   *  scratchpad, as one batch (Step 6 spec §4.2's simple one-off "Move to Dock"). */
  onMoveToDock: () => void;
  /** Move Mode (the Dock's Move action) — see App.tsx's movingPageCardIds. True while
   *  one or more Cards are "in transit" waiting for a drop target to be tapped. */
  moving: boolean;
  onEnterMoveMode: () => void;
  onCancelMove: () => void;
  /** The Dock Card panel's own Move Mode (App.tsx's movingDockCardIds) — same
   *  in-transit-waiting-for-a-drop-zone shape as `moving` above, kept as a separate
   *  flag since a Dock Card and a Page Card can never be mid-move at the same time
   *  (selection is already mutually exclusive between the two) but the Dock still
   *  needs to know which kind it's showing Cancel for. */
  dockCardMoving: boolean;
  onCancelDockCardMove: () => void;
  /** Which extended panel (Step 6 spec §3.2) is currently open, lifted to App.tsx so
   *  the Feed Input Button's "Open" action can open the Vault view too, not just the
   *  Dock's own toggle. Folders and search within the Vault view are a further two
   *  mutually exclusive sub-views over it — see useVault.ts. */
  openPanel: DockPanel | null;
  onOpenPanel: (panel: DockPanel) => void;
  onClosePanel: () => void;
  vaultSearchResults: Card[];
  vaultQuery: string;
  onVaultQueryChange: (q: string) => void;
  /** The currently browsed Folder's contents (subfolders, its Cards, and its
   *  breadcrumb) — null only until the first fetch lands. Browsing the vault root
   *  looks the same as any other Folder here, just with `folder: null`. */
  vaultFolderContents: FolderContents | null;
  onOpenVaultFolder: (id: string | null) => void;
  /** Create a new blank Card directly in the vault, in whichever Folder is currently
   *  open — IDE-"new file" style, like the Page-oriented action this replaced.
   *  Returns the created Card so the Dock can select it immediately. Null while
   *  search is active (there's no single Folder to create into). */
  onCreateVaultCard: (() => Promise<Card>) | null;
  onCreateVaultFolder: ((title: string) => Promise<Folder>) | null;
  onRenameVaultCard: (id: string, title: string) => void;
  onRenameVaultFolder: (id: string, title: string) => void;
  onMoveVaultCard: (id: string, folderId: string | null) => void;
  onMoveVaultFolder: (id: string, parentId: string | null) => void;
  onDeleteVaultCard: (id: string) => void;
  onDeleteVaultFolder: (id: string) => void;
  /** Add a vault Card to the current Page, if one exists. */
  onAddVaultCardToPage: ((cardId: string) => void) | null;
  /** The Dock Cards toggle's own repurposed behavior while a vault Card is selected
   *  (dockCardsAction below) — adds it to the Dock, then opens the Dock Cards panel
   *  straight onto it, instead of the toggle's normal open/close behavior. */
  onAddVaultCardToDock: (cardId: string) => void;
  /** The Dock's persistent scratchpad layer (Step 6 spec §1.2/§3.3) — always shown as
   *  a horizontal scroll row in the base bar, regardless of selection/navigation
   *  state, alongside its own extended panel. */
  dockCards: DockCardWithCard[];
  /** Reuses the same "editing embed ids" set as page-embedded Cards — edit state is a
   *  property of a Card's id, not of where it's currently displayed, and a Dock Card
   *  behaves exactly like an embed (writes straight through, no draft) — reachable
   *  both via double-click/long-press (same as any other embed) and via the Dock's
   *  own Edit action once a Dock Card is selected (see selectedDockCardIds below). */
  editingDockCardIds: ReadonlySet<string>;
  onToggleDockCardEdit: (cardId: string) => void;
  onCreateDockCard: (title: string, content: string) => void;
  /** The Dock Card creation flow's own Upload option (DockCardsPanel.tsx's
   *  FeedInputButton, showGenerate false) — mirrors a Page's Feed Input Button
   *  Upload, but returns the created DockCard so that panel can jump straight to
   *  it, same as onCreateDockCard's own landing behavior. */
  onUploadDockCardFile: (file: File) => Promise<DockCardWithCard>;
  /** Non-null right after a Card lands in the Dock (moved from a Page, or added from
   *  the Vault) — DockCardsPanel.tsx jumps straight to it once it's in `dockCards`,
   *  then fires onOpenedDockCard to clear this back to null. */
  dockCardToOpen: string | null;
  onOpenedDockCard: () => void;
  /** Every currently-selected Dock Card (by its own id, not cardId) — the same
   *  select-then-act model as selectedCards, driving the Dock's own action row
   *  (back-caret/Move to Page/Close), matching what a selected Page Card gets.
   *  Tapping an already-selected Dock Card jumps into editing it instead of
   *  deselecting (App.tsx's toggleSelectDockCard). */
  selectedDockCardIds: ReadonlySet<string>;
  onToggleSelectDockCard: (dockCardId: string) => void;
  onDeselectDockCards: () => void;
  /** The selection's own "Close" action — unlike a selected Page Card's Close (just
   *  deselects), this actually removes the selected Dock Card(s): deletes them
   *  outright if never saved to the vault, or just unpins them from the Dock (vault
   *  Card left untouched) if they were. */
  onCloseSelectedDockCards: () => void;
  /** Enters the Dock Card panel's own Move Mode (dockCardMoving above) — the
   *  destination Page/Tab/position is picked afterward by navigating there and
   *  tapping a drop zone, not by this action itself. */
  onMoveSelectedDockCardsToPage: () => void;
  /** The Pages panel (Step 6 spec §3.5) — top-to-bottom stack order, same indexing as
   *  App.tsx's sortedPages. */
  sortedPages: PageWithCards[];
  currentPageIndex: number;
  onSelectPage: (index: number) => void;
  /** The compact Page nav cluster (up/down/add + the Pages panel toggle, merged into
   *  one bottom-right control in the Dock's base bar — formerly the standalone
   *  PageNav component). Already false/true-computed by App.tsx the same way
   *  PageNav's own props were. */
  canNavigateUp: boolean;
  canNavigateDown: boolean;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onAddPage: () => void;
  /** The Tabs panel (Step 6 spec §3.4) — left-to-right order, same indexing as
   *  App.tsx's sortedTabs/swipe gesture. */
  tabs: Tab[];
  currentTabIndex: number;
  onSelectTab: (index: number) => void;
  onCreateTab: () => void;
}

interface DockAction {
  key: string;
  /**
   * Operation id gating this action, or null if it isn't part of the OperationRegistry
   * at all — "remove from page" was deliberately left as an ad hoc, unwrapped mutation
   * in Step 1 (packages/shared/src/registries/README.md explains why), so there's no
   * id to gate it on; it's always shown.
   */
  operationId: string | null;
  icon: IconName;
  spin?: boolean;
  /** Accessible name (aria-label/title) — the button shows only the icon now. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Toggled-on visual state (Button.css's .button--pressed) — the formatting row's
   *  only current user, showing e.g. Bold as "on" while the cursor sits in bold text. */
  active?: boolean;
}

/**
 * Which Operation ids a CardType allows, resolved against every Operation actually
 * registered (operationRegistry.list()) — a `["*"]` wildcard (the "note" type's
 * current value) means "everything registered", not literally the string "*".
 */
function supportedOperationIds(typeId: string): Set<string> {
  const cardType = cardTypeRegistry.get(typeId);
  const registeredIds = operationRegistry.list().map((op) => op.id);
  if (cardType.supportsOperations.includes("*")) {
    return new Set(registeredIds);
  }
  return new Set(cardType.supportsOperations.filter((id) => registeredIds.includes(id)));
}

/**
 * A single-row sticky footer (spec1.md Part 2 "The Dock") that's always the same
 * small height, whatever's selected — no title text, ever (Step 9): only the row of
 * icon buttons changes. The Vault toggle is always the first button in that same
 * row rather than a header row of its own, so the Dock never grows a second row on
 * its own; only the expandable Vault panel or a live generation preview (both
 * genuinely temporary) ever make it taller than that one row.
 *
 * Nothing selected -> just the Vault toggle; a Page selected (and no Card) -> Delete
 * Page only (Add Card/Upload File/Generate all moved to the Feed Input Button — Step 6
 * spec §5); a Card or embedded Card selected -> Edit/Save/Remove
 * (X — removes this Card from this Page, or this embed's `[[cardId]]` token from its
 * parent's content — only; the vault copy is untouched and can be reopened any time;
 * permanently deleting a Card from the vault is a Vault-panel-selection action
 * instead, alongside Rename/Move/Add to Page — see vaultModeActions below, which
 * takes over the row whenever something's selected inside an open Vault panel).
 * Edit still opens the same inline
 * title/textarea editor on the Card itself (Card.tsx/CardEmbed.tsx); the Dock only
 * triggers it, it doesn't render it. Save has no separate "unsaved" Badge anywhere —
 * the action's own icon is the indicator: a `+` while there's a draft to commit, a
 * tick once it's saved (and disabled, since there's nothing left to do; an embed is
 * always in this disabled/done state, since it has no draft step at all).
 *
 * The Card action buttons shown are derived from the selected Card's CardType
 * (cardTypeRegistry) and the Operations it supports (operationRegistry) rather than a
 * fixed list — see supportedOperationIds above. Page actions aren't part of that
 * registry (Pages aren't Cards), so they're unconditional.
 */
export function Dock({
  selectedCards,
  selectedEmbedId,
  isEditingActive,
  onRemoveEmbed,
  onDeleteEmbed,
  onDeselectEmbed,
  embedMoving,
  onEnterEmbedMoveMode,
  onCancelEmbedMove,
  onMoveEmbedToDock,
  generationError,
  onDismissGenerationError,
  generationNotice,
  onDismissGenerationNotice,
  annotationError,
  onDismissAnnotationError,
  onSaveSelected,
  generating,
  onStopGeneration,
  onGenerateSelected,
  onRunProcess,
  processRunning,
  pendingDiffCount,
  onAcceptAllDiffs,
  onDeselectAll,
  onMoveToDock,
  moving,
  onEnterMoveMode,
  onCancelMove,
  dockCardMoving,
  onCancelDockCardMove,
  openPanel,
  onOpenPanel,
  onClosePanel,
  vaultSearchResults,
  vaultQuery,
  onVaultQueryChange,
  vaultFolderContents,
  onOpenVaultFolder,
  onCreateVaultCard,
  onCreateVaultFolder,
  onRenameVaultCard,
  onRenameVaultFolder,
  onMoveVaultCard,
  onMoveVaultFolder,
  onDeleteVaultCard,
  onDeleteVaultFolder,
  onAddVaultCardToPage,
  onAddVaultCardToDock,
  dockCards,
  editingDockCardIds,
  onToggleDockCardEdit,
  onCreateDockCard,
  onUploadDockCardFile,
  dockCardToOpen,
  onOpenedDockCard,
  selectedDockCardIds,
  onToggleSelectDockCard,
  onDeselectDockCards,
  onCloseSelectedDockCards,
  onMoveSelectedDockCardsToPage,
  sortedPages,
  currentPageIndex,
  onSelectPage,
  canNavigateUp,
  canNavigateDown,
  onNavigateUp,
  onNavigateDown,
  onAddPage,
  tabs,
  currentTabIndex,
  onSelectTab,
  onCreateTab,
}: DockProps) {
  const vaultOpen = openPanel === "vault";
  const dockCardsOpen = openPanel === "dockCards";
  const pagesOpen = openPanel === "pages";
  const tabsOpen = openPanel === "tabs";

  // Content stays mounted one tick behind `openPanel` going to null, so the slide-
  // closed CSS transition below has something to animate away rather than the panel
  // just vanishing — cleared once that transition actually finishes (onTransitionEnd
  // on the wrapper further down).
  const [renderedPanel, setRenderedPanel] = useState<DockPanel | null>(openPanel);
  useEffect(() => {
    if (openPanel) setRenderedPanel(openPanel);
  }, [openPanel]);

  // Tapping anywhere on the main page content collapses whatever panel is open (Step
  // 6 spec §3.2) — excludes clicks inside `.dock` itself so the base bar's own
  // toggle buttons (which already open/close it directly) don't also trigger this.
  useEffect(() => {
    if (!openPanel) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element;
      if (!target.closest(".dock")) onClosePanel();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openPanel, onClosePanel]);
  /** Which vault Card or Folder is selected — clicking one selects it instead of
   *  acting on it immediately, so the Dock can show what to do with it (see
   *  vaultModeActions below). Selecting a Folder is deliberately independent of
   *  browsing it (see VaultView.tsx's doc comment): the Folder currently open and
   *  the Folder currently selected can be different, or the same, at once. */
  const [selectedVaultItem, setSelectedVaultItem] = useState<{ type: "card" | "folder"; id: string } | null>(
    null,
  );
  /** Non-null while a vault Card/Folder row shows an inline rename input in place of
   *  its label (VaultView.tsx's ItemLabel) — set by the Rename action below. */
  const [vaultRenaming, setVaultRenaming] = useState<{ type: "card" | "folder"; id: string } | null>(
    null,
  );
  /** Non-null while a vault Card/Folder is "in transit" waiting for a destination
   *  Folder to be picked — the vault-panel equivalent of movingPageCardIds/Move Mode. */
  const [vaultMoving, setVaultMoving] = useState<{ type: "card" | "folder"; id: string } | null>(null);
  const [processPickerPos, setProcessPickerPos] = useState<{ left: number; bottom: number } | null>(null);
  const processButtonRef = useRef<HTMLDivElement>(null);

  // The formatting toolbar's target — whichever CardRichText instance was most
  // recently focused (activeEditorRegistry.ts), reactively re-read here since Dock is
  // a sibling, not an ancestor, of wherever that editor actually lives in the tree.
  const activeEditor = useActiveEditor();
  const formattingState = useEditorState({
    editor: activeEditor,
    selector: ({ editor }: { editor: Editor | null }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      heading: editor?.isActive("heading", { level: 2 }) ?? false,
      bulletList: editor?.isActive("bulletList") ?? false,
      orderedList: editor?.isActive("orderedList") ?? false,
    }),
  });

  /** Clears every piece of vault-panel-local selection state — used whenever the
   *  panel closes, so reopening it starts fresh rather than resuming mid-rename or
   *  mid-move at some Card/Folder that may not even be in view any more. */
  function closeVaultSelection() {
    setSelectedVaultItem(null);
    setVaultRenaming(null);
    setVaultMoving(null);
  }

  /** Navigating to a different Folder invalidates whatever was selected (a selected
   *  Card may not even be in the new list; a selected Folder's Rename/Move/Delete
   *  actions should disappear once you've navigated away from the reason you picked
   *  it) — but deliberately leaves `vaultMoving` alone, since browsing *is* how a
   *  Move destination gets picked (see VaultView.tsx's "Move Here" row). */
  function handleOpenVaultFolder(id: string | null) {
    setSelectedVaultItem(null);
    setVaultRenaming(null);
    onOpenVaultFolder(id);
  }

  const currentVaultFolder = vaultFolderContents?.folder ?? null;

  /** Shared by both the `selected` and `selectedEmbedId` branches below — a Card and
   *  an embedded Card get the same process/accept-all-diffs actions, same precedent
   *  as their existing Edit/Save/Remove set. Rendered specially in the row below
   *  (not a plain onClick) since "process" opens ProcessPicker anchored to its own
   *  button rather than firing immediately. */
  const processActions: DockAction[] = [
    ...(onRunProcess
      ? [
          {
            key: "process",
            operationId: null,
            icon: "annotate" as const,
            spin: processRunning,
            label: processRunning ? t("dock.action.processRunning") : t("dock.action.process"),
            // Computes a fixed viewport position from the button's own rect rather
            // than anchoring via CSS position:absolute — .dock__row scrolls
            // horizontally (overflow-x: auto), which clips an absolutely-positioned
            // popover that escapes upward even though it still "renders" (same
            // ancestor-overflow clipping behavior SelectionMenu.tsx's fixed
            // positioning already sidesteps for the same reason).
            onClick: () => {
              // TEMP DEBUG — remove once the annotation-run-doesn't-do-anything
              // issue is diagnosed.
              console.debug("[annot] Dock process button clicked", {
                hasRef: !!processButtonRef.current,
                processRunning,
              });
              setProcessPickerPos((open) => {
                if (open) {
                  console.debug("[annot] closing ProcessPicker");
                  return null;
                }
                const rect = processButtonRef.current?.getBoundingClientRect();
                if (!rect) {
                  console.debug("[annot] process button has no rect yet — picker will NOT open");
                  return null;
                }
                console.debug("[annot] opening ProcessPicker at", rect);
                return { left: rect.left, bottom: window.innerHeight - rect.top + 4 };
              });
            },
            disabled: processRunning,
          },
        ]
      : []),
    ...(onAcceptAllDiffs && pendingDiffCount > 0
      ? [
          {
            key: "acceptAllDiffs",
            operationId: null,
            icon: "done" as const,
            label: t("dock.action.acceptAllDiffs"),
            // TEMP DEBUG — remove once diagnosed.
            onClick: () => {
              console.debug("[annot] Dock accept-all-diffs button clicked", { pendingDiffCount });
              onAcceptAllDiffs();
            },
          },
        ]
      : []),
  ];

  const vaultLabel = vaultOpen ? t("dock.vault.close") : t("dock.vault.open");
  const vaultAction: DockAction = {
    key: "vault",
    operationId: null,
    icon: vaultOpen ? "close" : "vault",
    label: vaultLabel,
    onClick: () => {
      if (vaultOpen) {
        closeVaultSelection();
        onClosePanel();
      } else {
        onOpenPanel("vault");
      }
    },
  };

  const tabsLabel = tabsOpen ? t("dock.tabs.close") : t("dock.tabs.open");

  // Same convention as the Vault toggle: stays in the row and just changes what it
  // shows/does, rather than disappearing or replacing the row's other buttons —
  // a down-caret ("fold") once the panel's open, tray otherwise. While a Dock Card
  // is also selected, tapping it folds the panel *and* deselects in one go, since
  // there's no separate action-row real estate for a distinct Close there (see
  // dockCardsAction's use in the selectedDockCardIds branch above). While a *vault*
  // Card is selected instead, tapping it means "send this to the Dock" — same
  // toggle, a third repurposed meaning, rather than a dedicated "Add to Dock" button
  // alongside vaultModeActions' existing "Add to Page". While a Page Card or embed
  // is mid-Move, tapping it is Move's own "drop onto the Dock" destination — a
  // fourth repurposing, replacing what used to be a separate "Move to Dock" action
  // in each of those rows (see the `actions` ternary below, which includes this
  // button alongside Cancel only for those two move states — a Dock Card mid-Move
  // has nowhere to "move to Dock" *from*, since it's already there).
  const dockCardsLabel = moving || embedMoving ? t("dock.action.moveToDock") : dockCardsOpen ? t("dock.action.fold") : t("dockCards.open");
  const dockCardsAction: DockAction = {
    key: "dockCards",
    operationId: null,
    icon: dockCardsOpen ? "down" : "tray",
    label: dockCardsLabel,
    onClick: () => {
      if (moving) {
        onMoveToDock();
      } else if (embedMoving) {
        onMoveEmbedToDock();
      } else if (vaultOpen && selectedVaultItem?.type === "card") {
        onAddVaultCardToDock(selectedVaultItem.id);
        closeVaultSelection();
      } else if (selectedDockCardIds.size > 0) {
        onClosePanel();
        onDeselectDockCards();
      } else if (dockCardsOpen) {
        onClosePanel();
      } else {
        onOpenPanel("dockCards");
      }
    },
  };

  const vaultViewContent = renderedPanel === "vault" && (
    <div className="dock__extended-panel-view">
      <VaultView
        query={vaultQuery}
        onQueryChange={onVaultQueryChange}
        searchResults={vaultSearchResults}
        folder={currentVaultFolder}
        breadcrumb={vaultFolderContents?.breadcrumb ?? []}
        subfolders={vaultFolderContents?.folders ?? []}
        cards={vaultFolderContents?.cards ?? []}
        onOpenFolder={handleOpenVaultFolder}
        onCreateCard={
          onCreateVaultCard && !vaultQuery
            ? async () => {
                const card = await onCreateVaultCard();
                setSelectedVaultItem({ type: "card", id: card.id });
              }
            : null
        }
        onCreateFolder={
          onCreateVaultFolder && !vaultQuery
            ? async () => {
                const folder = await onCreateVaultFolder(t("vault.untitledFolder"));
                setVaultRenaming({ type: "folder", id: folder.id });
              }
            : null
        }
        selectedCardId={selectedVaultItem?.type === "card" ? selectedVaultItem.id : null}
        onSelectCard={(id) =>
          setSelectedVaultItem((prev) =>
            prev?.type === "card" && prev.id === id ? null : { type: "card", id },
          )
        }
        selectedFolderId={selectedVaultItem?.type === "folder" ? selectedVaultItem.id : null}
        onSelectFolder={(id) =>
          setSelectedVaultItem((prev) =>
            prev?.type === "folder" && prev.id === id ? null : { type: "folder", id },
          )
        }
        renamingId={vaultRenaming?.id ?? null}
        onCommitRename={(title) => {
          if (!vaultRenaming) return;
          const { type, id } = vaultRenaming;
          setVaultRenaming(null);
          if (type === "folder") onRenameVaultFolder(id, title);
          else onRenameVaultCard(id, title);
        }}
        onCancelRename={() => setVaultRenaming(null)}
        moving={vaultMoving}
        onPickMoveTarget={() => {
          if (!vaultMoving) return;
          const targetId = currentVaultFolder?.id ?? null;
          if (vaultMoving.type === "card") onMoveVaultCard(vaultMoving.id, targetId);
          else onMoveVaultFolder(vaultMoving.id, targetId);
          setVaultMoving(null);
          setSelectedVaultItem(null);
        }}
      />
    </div>
  );

  /**
   * Actions for whatever's selected *within* the Vault panel — takes priority over
   * selectedEmbedId/selectedCards below while the panel's open and something
   * in it is selected, since that's the more specific, more recent thing the user
   * pointed at. Falls through to the usual Page/Card row once nothing's selected in
   * the vault (e.g. freshly opened at the root with nothing picked yet), so opening
   * the panel over an already-selected Page Card doesn't blank the row out. A
   * selected Folder needn't be the one currently browsed — see VaultView.tsx's doc
   * comment — so Delete only navigates out if they happen to be the same one.
   */
  let vaultModeActions: DockAction[] | null = null;
  if (vaultOpen && selectedVaultItem?.type === "card") {
    const cardId = selectedVaultItem.id;
    vaultModeActions = [
      ...(onAddVaultCardToPage
        ? [
            {
              key: "vaultAddToPage",
              operationId: null,
              icon: "plus" as const,
              label: t("dock.action.addToPage"),
              onClick: () => {
                onAddVaultCardToPage(cardId);
                onClosePanel();
                closeVaultSelection();
              },
            },
          ]
        : []),
      {
        key: "vaultRename",
        operationId: null,
        icon: "edit" as const,
        label: t("dock.action.rename"),
        onClick: () => {
          setVaultMoving(null);
          setVaultRenaming({ type: "card", id: cardId });
        },
      },
      {
        key: "vaultMove",
        operationId: null,
        icon: "move" as const,
        label: t("dock.action.move"),
        onClick: () => {
          setVaultRenaming(null);
          setVaultMoving({ type: "card", id: cardId });
        },
      },
      {
        key: "vaultDelete",
        operationId: null,
        icon: "delete" as const,
        label: t("dock.action.delete"),
        danger: true,
        onClick: () => {
          onDeleteVaultCard(cardId);
          setSelectedVaultItem(null);
        },
      },
    ];
  } else if (vaultOpen && selectedVaultItem?.type === "folder") {
    const folderId = selectedVaultItem.id;
    vaultModeActions = [
      {
        key: "vaultRenameFolder",
        operationId: null,
        icon: "edit" as const,
        label: t("dock.action.rename"),
        onClick: () => {
          setVaultMoving(null);
          setVaultRenaming({ type: "folder", id: folderId });
        },
      },
      {
        key: "vaultMoveFolder",
        operationId: null,
        icon: "move" as const,
        label: t("dock.action.move"),
        onClick: () => {
          setVaultRenaming(null);
          setVaultMoving({ type: "folder", id: folderId });
        },
      },
      {
        key: "vaultDeleteFolder",
        operationId: null,
        icon: "delete" as const,
        label: t("dock.action.delete"),
        danger: true,
        onClick: () => {
          onDeleteVaultFolder(folderId);
          // Only step back out to the parent if the Folder just deleted was the one
          // currently browsed — deleting a merely-selected subfolder leaves the view
          // exactly where it was, minus that row.
          if (currentVaultFolder && folderId === currentVaultFolder.id) {
            onOpenVaultFolder(currentVaultFolder.parentId);
          }
          setSelectedVaultItem(null);
        },
      },
    ];
  }

  let modeActions: DockAction[] = [];

  if (selectedEmbedId) {
    modeActions = [
      {
        key: "backEmbed",
        operationId: null,
        icon: "back" as const,
        label: t("dock.action.back"),
        onClick: onDeselectEmbed,
      },
      // No Edit action: tapping an already-selected embed jumps straight into
      // editing it now (App.tsx's selectEmbed) — this button would be redundant.
      // No Save action either: an embed writes straight through to the vault on
      // every keystroke (CardEmbed.tsx/editCard), so there's never anything pending
      // to commit — it would always be showing the disappeared/saved state.
      {
        key: "moveEmbed",
        operationId: null,
        icon: "move" as const,
        label: t("dock.action.move"),
        onClick: onEnterEmbedMoveMode,
      },
      // No separate Move to Dock: dropping onto the Dock is now one of Move's own
      // destinations — tap the Dock Cards toggle itself while moving (see
      // dockCardsAction below).
      ...processActions,
      {
        key: "removeEmbed",
        operationId: null,
        // The "eject from container" glyph — Remove and Close are the same action
        // now (deselecting is the row's own back-caret above instead), so there's
        // no separate close-shaped icon competing with it any more.
        icon: "remove" as const,
        label: t("dock.action.remove"),
        onClick: onRemoveEmbed,
      },
      {
        key: "deleteEmbed",
        operationId: null,
        icon: "delete" as const,
        label: t("dock.action.delete"),
        onClick: onDeleteEmbed,
        danger: true,
      },
    ];
  } else if (selectedCards.length > 0) {
    // Needs saving if ANY selected Card has a pending draft edit not yet committed,
    // or has never been saved to the Vault at all yet (still page-local scratch
    // content from creation/generation — see schema.prisma's Card.savedToVault doc
    // comment) — the Save action below batches over every selected Card that
    // matches, not just a single one.
    const hasUnsavedDraft = selectedCards.some(
      (pc) => pc.draftTitle !== null || pc.draftContent !== null || !pc.card.savedToVault,
    );
    // Only show an action every selected Card's own CardType actually supports —
    // the intersection, not the union, since e.g. Save shouldn't appear at all if
    // even one selected Card's type doesn't allow it.
    const available = selectedCards
      .map((pc) => supportedOperationIds(getCardTypeId(pc.card)))
      .reduce((a, b) => new Set([...a].filter((id) => b.has(id))));
    modeActions = [
      {
        key: "back",
        operationId: null,
        icon: "back" as const,
        label: t("dock.action.back"),
        onClick: onDeselectAll,
      },
      {
        key: "generateSelected",
        operationId: null,
        icon: generating ? ("stop" as const) : ("generate" as const),
        spin: generating,
        label: generating ? t("feedInput.stopGeneration") : t("feedInput.generate"),
        onClick: generating ? onStopGeneration : onGenerateSelected,
      },
      // No Edit action: tapping an already-selected Card jumps straight into
      // editing it now (App.tsx's toggleSelectPageCard) — this button would be
      // redundant.
      ...(hasUnsavedDraft
        ? [
            {
              key: "save",
              operationId: "card.save",
              icon: "save" as const,
              label: t("dock.action.save"),
              onClick: onSaveSelected,
            },
          ]
        : []),
      // ^ Present only while there's something to commit — once saved, it just
      // disappears from the row entirely rather than sticking around as a
      // disabled checkmark.
      {
        key: "move",
        operationId: null,
        icon: "move" as const,
        label: t("dock.action.move"),
        onClick: onEnterMoveMode,
      },
      // No separate Move to Dock: dropping onto the Dock is now one of Move's own
      // destinations — tap the Dock Cards toggle itself while moving (see
      // dockCardsAction below).
      ...processActions,
    ].filter((action) => action.operationId === null || available.has(action.operationId));
  } else if (selectedDockCardIds.size > 0) {
    // Same back-caret/Move/Close shape as a selected Page Card above — selecting a
    // Card from the Dock's own scratchpad gets the same functions selecting one
    // from the Page does, just Move to Page instead of Move (there's no "position
    // within a Page" for a Card that isn't on one) and no Circle (Dock Cards have no
    // Page/Tab to draw generation context from). Fold isn't in this list — it's the
    // row's own dockCardsAction button turned into a down-caret (see below), same
    // convention as opening the Vault: that toggle stays in place and just changes
    // what it does/shows, rather than disappearing behind a separate action. Unlike
    // a selected Page Card's back-caret (just deselects), Close here actually
    // removes the Card (onCloseSelectedDockCards): there's no other "leave it be"
    // gesture for a Dock Card the way a Page Card's Move/position covers, so Close
    // carries that weight instead, staying its own action alongside — not instead
    // of — the back-caret's plain deselect.
    modeActions = [
      {
        key: "backDockCards",
        operationId: null,
        icon: "back" as const,
        label: t("dock.action.back"),
        onClick: onDeselectDockCards,
      },
      // No Edit action: tapping an already-selected Dock Card jumps straight into
      // editing it now (App.tsx's toggleSelectDockCard) — this button would be
      // redundant. No Save action either: a Dock Card writes straight through on
      // every keystroke (same as an embed — CardEmbed.tsx/editCard), so there's
      // never anything pending to commit.
      {
        key: "moveDockCardsToPage",
        operationId: null,
        icon: "move" as const,
        label: t("dockCards.moveToPage"),
        onClick: onMoveSelectedDockCardsToPage,
      },
      {
        key: "closeDockCards",
        operationId: null,
        icon: "close" as const,
        label: t("dock.action.close"),
        onClick: onCloseSelectedDockCards,
      },
    ];
  }
  // Nothing selected and just a Page in view: no Page-level action left in the Dock
  // (Add Card/Upload File/Generate moved to the Feed Input Button in Step 6 spec §5;
  // Delete Page was removed outright per feedback) — modeActions stays empty, so the
  // row shows just the Vault toggle.

  // Selection Lock (Step 6 spec §4.3): once a Page Card or embed is selected, the
  // Vault/Pages/Tabs toggles disappear from the row entirely (they simply aren't
  // reachable — there's no separate "disable" state to manage), leaving only the
  // selection's own actions. A Page merely in view with nothing selected still gets
  // them alongside Delete Page, same as before. A selected *Dock* Card is
  // deliberately different (feedback): the Vault toggle stays put on the left, and
  // only the Dock Cards toggle itself changes (into a down-caret — see
  // dockCardsAction above) — same convention as opening the Vault does to its own
  // toggle, and also why the page-nav cluster below keys off this narrower flag
  // rather than "is anything at all selected".
  const embedOrPageCardSelected = !!selectedEmbedId || selectedCards.length > 0;

  // The formatting row itself — replaces the whole action row while isEditingActive
  // (below), rather than sitting alongside Save/Move/etc., same "collapse to just
  // what's relevant" convention Move Mode already uses for its own Cancel-only row.
  // No back/close action of its own: the existing tap-outside-to-close gesture that
  // already ends inline editing is what drops the row back to normal.
  const formattingActions: DockAction[] = [
    {
      key: "formatBold",
      operationId: null,
      icon: "bold" as const,
      label: t("dock.action.bold"),
      onClick: () => activeEditor?.chain().focus().toggleBold().run(),
      active: formattingState?.bold ?? false,
      disabled: !activeEditor,
    },
    {
      key: "formatItalic",
      operationId: null,
      icon: "italic" as const,
      label: t("dock.action.italic"),
      onClick: () => activeEditor?.chain().focus().toggleItalic().run(),
      active: formattingState?.italic ?? false,
      disabled: !activeEditor,
    },
    {
      key: "formatHeading",
      operationId: null,
      icon: "heading" as const,
      label: t("dock.action.heading"),
      onClick: () => activeEditor?.chain().focus().toggleHeading({ level: 2 }).run(),
      active: formattingState?.heading ?? false,
      disabled: !activeEditor,
    },
    {
      key: "formatBulletList",
      operationId: null,
      icon: "bulletList" as const,
      label: t("dock.action.bulletList"),
      onClick: () => activeEditor?.chain().focus().toggleBulletList().run(),
      active: formattingState?.bulletList ?? false,
      disabled: !activeEditor,
    },
    {
      key: "formatOrderedList",
      operationId: null,
      icon: "orderedList" as const,
      label: t("dock.action.orderedList"),
      onClick: () => activeEditor?.chain().focus().toggleOrderedList().run(),
      active: formattingState?.orderedList ?? false,
      disabled: !activeEditor,
    },
  ];

  // While a Card is in transit (Move Mode, or the vault panel's own equivalent), the
  // Dock collapses to just a Cancel action — no Vault toggle, no other actions — so
  // the only thing to do is tap a drop target (PageStack.tsx, or VaultView's "Move
  // Here" row) or back out. Page Card/embed Move also keeps dockCardsAction in the
  // row alongside Cancel — its own repurposed "drop onto the Dock" destination (see
  // dockCardsAction above); a Dock Card mid-Move has nowhere to drop back onto the
  // Dock, so dockCardMoving doesn't get it.
  const actions: DockAction[] = moving
    ? [
        {
          key: "cancelMove",
          operationId: null,
          icon: "close" as const,
          label: t("dock.action.cancelMove"),
          onClick: onCancelMove,
        },
        dockCardsAction,
      ]
    : dockCardMoving
      ? [
          {
            key: "cancelDockCardMove",
            operationId: null,
            icon: "close" as const,
            label: t("dock.action.cancelMove"),
            onClick: onCancelDockCardMove,
          },
        ]
      : embedMoving
        ? [
            {
              key: "cancelEmbedMove",
              operationId: null,
              icon: "close" as const,
              label: t("dock.action.cancelMove"),
              onClick: onCancelEmbedMove,
            },
            dockCardsAction,
          ]
        : vaultMoving
          ? [
              {
                key: "cancelVaultMove",
                operationId: null,
                icon: "close" as const,
                label: t("dock.action.cancelMove"),
                onClick: () => setVaultMoving(null),
              },
            ]
          : isEditingActive
            ? formattingActions
            : embedOrPageCardSelected
              ? (vaultModeActions ?? modeActions)
              : [vaultAction, dockCardsAction, ...(vaultModeActions ?? modeActions)];

  const dockCardsViewContent = renderedPanel === "dockCards" && (
    <div className="dock__extended-panel-view">
      <DockCardsPanel
        dockCards={dockCards}
        editingIds={editingDockCardIds}
        onToggleEdit={onToggleDockCardEdit}
        selectedIds={selectedDockCardIds}
        onToggleSelect={onToggleSelectDockCard}
        onCreateCard={onCreateDockCard}
        onOpenVault={() => onOpenPanel("vault")}
        onUploadFile={onUploadDockCardFile}
        openCardId={dockCardToOpen}
        onOpenedCard={onOpenedDockCard}
      />
    </div>
  );

  const pagesViewContent = renderedPanel === "pages" && (
    <div className="dock__extended-panel-view">
      <PagesPanel
        pages={sortedPages}
        currentIndex={currentPageIndex}
        onSelectPage={(index) => {
          onSelectPage(index);
          onClosePanel();
        }}
      />
    </div>
  );

  const tabsViewContent = renderedPanel === "tabs" && (
    <div className="dock__extended-panel-view">
      <TabsPanel
        tabs={tabs}
        currentIndex={currentTabIndex}
        onSelectTab={(index) => {
          onSelectTab(index);
          onClosePanel();
        }}
        onCreateTab={onCreateTab}
      />
    </div>
  );

  // Pages/Tabs are short lists — cap them noticeably smaller than Vault/Dock Cards
  // (which can hold a lot more), so they don't take up more space than they need.
  const isCompactPanel = renderedPanel === "pages" || renderedPanel === "tabs";

  // The Extended Panel (Step 6 spec §3.2) — a single slide-up drawer floating over
  // the page content, whichever of the four views above is currently open. Reachable
  // during Move Mode (either kind — moving/dockCardMoving) on purpose: opening Pages
  // or Tabs is how a move reaches a destination that isn't reachable by a couple of
  // taps on the up/down arrows (see the page-nav cluster below, visible during a
  // move for the same reason). No separate collapse header/chevron: every panel
  // already has its own inline way to fold back down right in the row below it —
  // re-tapping whichever toggle opened it (vaultAction/pagesAction/tabsAction, all
  // of which already switch to a "close" icon while open) or, for Dock Cards, the
  // row's own dedicated back button — so a dedicated header row here would only add
  // height without adding a new way to close it.
  const extendedPanel = (
    <div
      className={`dock__extended-panel${openPanel ? " dock__extended-panel--open" : ""}${isCompactPanel ? " dock__extended-panel--compact" : ""}`}
      onTransitionEnd={() => {
        if (!openPanel) setRenderedPanel(null);
      }}
    >
      {vaultViewContent}
      {dockCardsViewContent}
      {pagesViewContent}
      {tabsViewContent}
    </div>
  );

  return (
    <footer className="dock">
      {extendedPanel}
      {generationNotice && (
        <div className="dock__notice-banner" role="status">
          <span className="dock__error-banner-text">{generationNotice}</span>
          <button
            type="button"
            className="dock__error-banner-dismiss"
            aria-label={t("dock.action.dismiss")}
            title={t("dock.action.dismiss")}
            onClick={onDismissGenerationNotice}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {generationError && (
        <div className="dock__error-banner" role="alert">
          <span className="dock__error-banner-text">{generationError}</span>
          <button
            type="button"
            className="dock__error-banner-dismiss"
            aria-label={t("dock.action.dismiss")}
            title={t("dock.action.dismiss")}
            onClick={onDismissGenerationError}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {annotationError && (
        <div className="dock__error-banner" role="alert">
          <span className="dock__error-banner-text">{annotationError}</span>
          <button
            type="button"
            className="dock__error-banner-dismiss"
            aria-label={t("dock.action.dismiss")}
            title={t("dock.action.dismiss")}
            onClick={onDismissAnnotationError}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {/* One single row, always — the Dock Cards toggle (in `actions` below) swaps
          this row's content for the Dock Cards scroll rather than opening a second,
          permanently-visible row (feedback: "Dock is still too tall... only one
          row"). Tapping the row's own close button (or the toggle again) goes back.
          Suppressed the same way the page-nav cluster already is: Move Mode,
          vault-item Move, and Selection Lock (Step 6 spec §4.3) all take priority —
          `actions` itself already resolves to just Cancel / the selected-card row in
          those states, so this only ever shows once nothing else claims the row. */}
      <div className="dock__bottom-row">
        <div className="dock__row">
          {actions.map((action) =>
            // "process" opens ProcessPicker anchored to its own button, rather
            // than firing an action directly — needs its own positioned wrapper,
            // unlike every other plain-click DockAction below.
            action.key === "process" ? (
              <div key="process" className="dock__process-wrap" ref={processButtonRef}>
                <Button
                  iconOnly
                  onClick={action.onClick}
                  disabled={action.disabled}
                  aria-label={action.label}
                  title={action.label}
                >
                  <Icon name={action.icon} spin={action.spin} />
                </Button>
              </div>
            ) : (
              <Button
                key={action.key}
                iconOnly
                variant={action.danger ? "danger" : "default"}
                className={action.active ? "button--pressed" : undefined}
                // Formatting buttons must not steal focus from the ProseMirror
                // contentEditable on mousedown — doing so collapses the text
                // selection before the click's toggleBold()/etc. command runs.
                // Every other DockAction is a plain fire-and-forget click, so this
                // is scoped to the "format*" keys rather than applied to all of them.
                onMouseDown={action.key.startsWith("format") ? (e) => e.preventDefault() : undefined}
                onClick={action.onClick}
                disabled={action.disabled}
                aria-label={action.label}
                title={action.label}
              >
                <Icon name={action.icon} spin={action.spin} />
              </Button>
            ),
          )}
        </div>
        {/* The Page nav cluster (formerly the standalone PageNav component,
            merged here per feedback) — up/down/add plus the Pages panel toggle,
            pinned to the bottom-right corner of the Dock. The Tabs toggle sits
            further right still, deliberately styled much more subtly
            (dock__page-nav-tabs) — it's page manipulation's more minor sibling,
            not an equally-weighted action. Hidden while vault-item Move is active,
            or while a Page Card/embed is selected and NOT mid-move (Selection Lock,
            Step 6 spec §4.3) — a selected *Dock* Card deliberately leaves it visible,
            same as Vault (see embedOrPageCardSelected above). Moving either kind of
            Card (page or Dock) is the one deliberate exception to Selection Lock:
            reaching a destination Page/Tab that isn't the one currently in view
            means navigating there first, so this cluster has to stay reachable the
            whole time a move is in progress even though the selection it carries
            forward (handleEnterMoveMode/handleEnterDockCardMoveMode) is still
            technically non-empty. */}
        {!vaultMoving && (!embedOrPageCardSelected || moving || dockCardMoving) && (
          <div className="dock__page-nav">
            <button
              type="button"
              disabled={!canNavigateUp}
              onClick={onNavigateUp}
              aria-label={t("pageStack.up")}
              title={t("pageStack.up")}
            >
              <Icon name="up" />
            </button>
            <button
              type="button"
              onClick={canNavigateDown ? onNavigateDown : onAddPage}
              aria-label={canNavigateDown ? t("pageStack.down") : t("pageStack.addPage")}
              title={canNavigateDown ? t("pageStack.down") : t("pageStack.addPage")}
            >
              <Icon name={canNavigateDown ? "down" : "plus"} />
            </button>
            {/* Which Page, of how many, is currently in view — same
                position-in-the-stack info the up/down arrows and the divider at the
                bottom of a Page's content (PageStack.tsx) let you feel your way
                through, just spelled out as a number. */}
            {currentPageIndex !== -1 && (
              <span className="dock__page-nav-count" aria-hidden="true">
                {currentPageIndex + 1}/{sortedPages.length}
              </span>
            )}
            <button
              type="button"
              onClick={() => (pagesOpen ? onClosePanel() : onOpenPanel("pages"))}
              aria-label={pagesOpen ? t("dock.pages.close") : t("dock.pages.open")}
              title={pagesOpen ? t("dock.pages.close") : t("dock.pages.open")}
            >
              <Icon name={pagesOpen ? "close" : "pages"} />
            </button>
            <button
              type="button"
              className="dock__page-nav-tabs"
              onClick={() => (tabsOpen ? onClosePanel() : onOpenPanel("tabs"))}
              aria-label={tabsLabel}
              title={tabsLabel}
            >
              <Icon name={tabsOpen ? "close" : "tabs"} />
            </button>
            {currentTabIndex !== -1 && tabs.length > 1 && (
              <span className="dock__page-nav-count dock__page-nav-count--tabs" aria-hidden="true">
                {currentTabIndex + 1}/{tabs.length}
              </span>
            )}
          </div>
        )}
      </div>
      {processPickerPos && (
        <ProcessPicker
          style={{ left: processPickerPos.left, bottom: processPickerPos.bottom }}
          onPick={(process) => {
            setProcessPickerPos(null);
            onRunProcess?.(process);
          }}
          onClose={() => setProcessPickerPos(null)}
        />
      )}
    </footer>
  );
}

import { Fragment, useEffect, useRef, useState } from "react";
import type {
  ActionFieldKind,
  Card,
  CalloutKind,
  DockCardWithCard,
  NearbyItem,
  PageCardWithCard,
  PageSummary,
} from "@wattle/shared";
import { cardTypeRegistry, flattenToPlainText, htmlToDoc, operationRegistry } from "@wattle/shared";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import type { AnnotationProcess } from "../../api/client.js";
import { Button, Icon } from "../primitives/index.js";
import type { IconName } from "../primitives/Icon.js";
import { VaultView } from "../Vault/VaultView.js";
import { DockCardsPanel } from "./DockCardsPanel.js";
import { NearbyPanel } from "./NearbyPanel.js";
import { PagesPanel } from "./PagesPanel.js";
import { ProcessPicker } from "./ProcessPicker.js";
import { ConvertPicker } from "./ConvertPicker.js";
import { CardLinkPicker } from "../Card/CardLinkPicker.js";
import { PageLinkPicker } from "../Card/PageLinkPicker.js";
import { ActionFieldKindPicker } from "../Card/richtext/ActionFieldKindPicker.js";
import { LinkUrlPicker } from "../Card/richtext/LinkUrlPicker.js";
import { CalloutKindPicker } from "../Card/richtext/CalloutKindPicker.js";
import { CardRichText } from "../Card/richtext/CardRichText.js";
import { getCardFileUrl, uploadRichTextImage } from "../../api/client.js";
import { getCardTypeId } from "../../lib/getCardTypeId.js";
import { isMarkdownFile } from "../../lib/isMarkdownFile.js";
import { convertMarkdownToWattleHtml } from "../../lib/markdownToWattleHtml.js";
import { getCachedCard } from "../../lib/cardStore.js";
import { useActiveEditor, useActiveEditorFocused } from "../../lib/activeEditorRegistry.js";
import { useActiveStackControls } from "../../lib/activeStackRegistry.js";
import { clearQuotes, useQuotes } from "../../lib/quotesRegistry.js";
import { defaultActionFieldAttrs } from "../../lib/actionFieldDefaults.js";
import { useSelectionLookup } from "../../hooks/useSelectionLookup.js";
import { quickAddToDock, quickAddToPage } from "../../lib/quickAddRegistry.js";
import { t } from "../../i18n/index.js";
import "./Dock.css";

const EMPTY_ANCESTOR_IDS: ReadonlySet<string> = new Set();

/** A Quote's `text` is plain text (SelectionMenu.tsx's `menu.text`, straight off the
 *  native browser Selection), so buildConvertHtml below has to escape it itself
 *  before splicing it into an HTML blob — same escaping migrateContentToHtml.ts's
 *  own plain-text migration path uses. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The three extended-panel views (Step 6 spec §3.2) — Tabs is a later step. Only one
 *  is ever open at once, lifted to App.tsx as a single `openPanel` value rather than
 *  independent booleans so that's structurally guaranteed, not just convention. */
export type DockPanel = "vault" | "dockCards" | "pages" | "nearby";

interface DockProps {
  /** Every currently-selected Card — multiple Cards can be selected at once now
   *  (App.tsx's toggleSelectPageCard adds rather than replaces). Save/Hide/Move/
   *  removeSelected/the prompt panel's context all batch over the whole array;
   *  actions that fundamentally need exactly one target (rewrite-in-place, a
   *  selected Stack's own generation, annotate/diff processes) gate on
   *  `.length === 1` and disappear otherwise. Empty when nothing's selected. */
  selectedCards: PageCardWithCard[];
  /** Every currently-selected embedded Card's id (App.tsx's selectEmbed toggles
   *  membership the same way toggleSelectPageCard does for top-level Cards — several
   *  can be selected at once, alongside `selectedCards` and Quotes, all feeding the
   *  lookup panel's combined "N words, N cards, N quotes" context below). Used only
   *  for that combined context — the single-embed action row further down keys off
   *  `selectedEmbedId` instead. */
  selectedEmbedIds: ReadonlySet<string>;
  /** Which embedded Card, if exactly one is selected and no top-level Cards are also
   *  selected, gets the single-target action row (App.tsx derives this from
   *  `selectedEmbedIds`) — back-caret/Edit/Save/Move/Move to Dock same as a top-level
   *  Card, plus Remove/Delete which only an embed has. Save is always shown
   *  already-done since embeds are always already-saved vault Cards (CardLinkPicker
   *  only offers saved ones) that write straight through on every keystroke, so
   *  there's never anything pending to commit. There's no per-embed Generate:
   *  Generate is only ever available via `selectedCards` below. Tapping an
   *  already-selected embed again jumps into editing it rather than deselecting
   *  (App.tsx's selectEmbed) — onDeselectEmbed below is the only way back out. Null
   *  the moment a second embed (or any top-level Card) joins the selection — this
   *  row disappears, but each embed's own highlight (via selectedEmbedIds) stays. */
  selectedEmbedId: string | null;
  /** True while whatever's selected (Page Card, Dock Card, or embed) is also in its
   *  own inline edit mode — swaps the row for the rich-text formatting toolbar
   *  (bold/italic/heading/lists), replacing Move/Save/Generate/etc. for as long as
   *  editing is active (App.tsx derives this from editingPageCardIds/editingEmbedIds,
   *  no new state of its own). The formatting row itself only actually renders while
   *  the rich-text body also has focus (activeEditorRegistry's focused flag) — this
   *  flag alone stays true the whole time editing is open, including while the title
   *  field (a plain, non-TipTap input) has focus instead. */
  isEditingActive: boolean;
  /** The formatting row's own back-caret (its very first button) — exits editing the
   *  same way the existing click-outside-to-close gesture already does for whichever
   *  of Page Card/embed/Dock Card is currently editing (App.tsx's exitEditing). */
  onExitEditing: () => void;
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
  /** Freezes the single selected Card (Open/Frozen — Wattle vault plan) — read-only
   *  from here on; only shown once it's savedToVault, still Open, and has nothing
   *  unsaved pending (see this action's own gating above). */
  onFreezeSelected: () => void;
  /** Saves every selected Card that has something pending — a no-op for any that
   *  don't (App.tsx batches the existing per-Card save-to-vault call). */
  onSaveSelected: () => void;
  /** Removes every selected Card from the Page in one go, then clears the
   *  selection (App.tsx's handleRemoveSelected) — the only way to remove a Card
   *  from the Page now; a tap on a Card itself just toggles its own selection
   *  in/out (Card.tsx's onSelect). */
  onRemoveSelected: () => void;
  /** Flips `metadata.hidden` on every selected Card at once (App.tsx's
   *  handleToggleHiddenSelected) — hidden Cards are skipped during normal Page
   *  rendering unless the Dock's own "reveal hidden cards" toggle (revealHidden
   *  below) is on. Works uniformly across every CardType, so — unlike Save/Move —
   *  it's never gated by operationId/supportsOperations. */
  onToggleHiddenSelected: () => void;
  /** The magic button's rewrite-in-place flow for a single selected plain (non-Stack)
   *  Card (rewriteBoxOpen/rewriteText below): tapping it once opens an inline text
   *  box in this same row (replacing every other selectedCards action for as long as
   *  it's open); tapping it again sends whatever's typed (or nothing) as
   *  `instruction` and collapses back to the normal row. Redoes the Card's own
   *  content via an instructed "diff" annotation run (App.tsx's
   *  handleRewriteSelected) instead of inserting a new sibling Card — its proposed
   *  edits surface as ordinary pending diffs afterward, reviewed via the same
   *  process/acceptAllDiffs actions below. A selected Stack keeps its own separate
   *  "append a new alternate" generation (isStackSelected below), untouched by this. */
  onRewriteSelected: (instruction: string) => void;
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
  /** The live Nearby list for whatever Page/Card is currently in view (useNearby.ts,
   *  driven from App.tsx) — re-scored against what's open and what's being typed,
   *  not a fixed list (Wattle vault plan). */
  nearbyItems: NearbyItem[];
  nearbyLoading: boolean;
  onOpenNearbyCard: (cardId: string) => void;
  vaultSearchResults: Card[];
  /** Page title matches (Pages + Links + Search rebuild, Phase 2) — the Vault panel's
   *  own "Search finds Pages/Cards" half, shown above vaultSearchResults. */
  vaultPageResults: PageSummary[];
  onOpenPageFromSearch: (id: string) => void;
  vaultQuery: string;
  onVaultQueryChange: (q: string) => void;
  /** Create a new blank Card directly in the vault — IDE-"new file" style. Returns
   *  the created Card so the Dock can select it immediately. */
  onCreateVaultCard: (() => Promise<Card>) | null;
  /** Uploads a file straight into the vault — the Vault panel's own Upload action
   *  (cardService.createFileCard). */
  onUploadVaultFile: ((file: File) => void) | null;
  onRenameVaultCard: (id: string, title: string) => void;
  onDeleteVaultCard: (id: string) => void;
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
  /** The compact Page nav cluster (up/down/add + Home + pin + the Pages panel toggle,
   *  merged into one bottom-right control in the Dock's base bar — formerly the
   *  standalone PageNav component). Up/down now walk `siblingGroupId` (Phase 3's
   *  optional next/prev trail), not a Tab's stack — App.tsx's useSiblingPages. */
  siblingIndex: number;
  siblingCount: number;
  canNavigateUp: boolean;
  canNavigateDown: boolean;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onAddPage: () => void;
  /** Recent-Pages back/forward (Phase 2's nav-chrome) — App.tsx's pageHistory/
   *  pageForwardHistory. */
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  /** Home + the scarce pin rail (Phase 4) — App.tsx's usePagesNav. */
  homePageId: string | null;
  currentPageId: string | null;
  onGoHome: () => void;
  pinnedPages: PageSummary[];
  isCurrentPagePinned: boolean;
  onTogglePinCurrent: () => void;
  onOpenPage: (id: string) => void;
  /** The base row's "reveal hidden cards" toggle (Apps feature spec §2) — while on,
   *  every hidden Card (Card.metadata.hidden) on the current Page renders inline
   *  with a dashed border instead of being excluded. Purely a display preference,
   *  independent of selection/Move Mode. */
  revealHidden: boolean;
  onToggleRevealHidden: () => void;
  /** "Save as Template", scope "page" — Tab is gone (see schema.prisma's Tab doc
   *  comment), so Template creation is page-scoped only now; a scope "tab"/hub
   *  Template can still be *opened*, just not newly authored from the UI. */
  onSaveAsTemplateFromPage: () => void;
  /** The Template currently being edited (editingTemplateId), or null — shown as a
   *  small badge while set; tapping it clears back to null. */
  editingTemplateName: string | null;
  onStopEditingTemplate: () => void;
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
  selectedEmbedIds,
  selectedEmbedId,
  isEditingActive,
  onExitEditing,
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
  onFreezeSelected,
  onSaveSelected,
  onRemoveSelected,
  onToggleHiddenSelected,
  onRewriteSelected,
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
  nearbyItems,
  nearbyLoading,
  onOpenNearbyCard,
  vaultSearchResults,
  vaultQuery,
  onVaultQueryChange,
  onCreateVaultCard,
  onUploadVaultFile,
  onRenameVaultCard,
  onDeleteVaultCard,
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
  siblingIndex,
  siblingCount,
  canNavigateUp,
  canNavigateDown,
  onNavigateUp,
  onNavigateDown,
  onAddPage,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  homePageId,
  currentPageId,
  onGoHome,
  pinnedPages,
  isCurrentPagePinned,
  onTogglePinCurrent,
  onOpenPage,
  vaultPageResults,
  onOpenPageFromSearch,
  revealHidden,
  onToggleRevealHidden,
  onSaveAsTemplateFromPage,
  editingTemplateName,
  onStopEditingTemplate,
}: DockProps) {
  const vaultOpen = openPanel === "vault";
  const dockCardsOpen = openPanel === "dockCards";
  const pagesOpen = openPanel === "pages";
  const nearbyOpen = openPanel === "nearby";

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
  // Closes the rewrite box the moment it's no longer meaningful to have open — the
  // selection changed (a different/no Card selected any more) or editing started —
  // rather than leaving it open pointed at a Card the row can no longer act on.
  useEffect(() => {
    if (selectedCards.length === 0 || isEditingActive) {
      setRewriteBoxOpen(false);
      setRewriteText("");
    }
  }, [selectedCards, isEditingActive]);
  /** Which vault Card is selected — clicking one selects it instead of acting on it
   *  immediately, so the Dock can show what to do with it (see vaultModeActions
   *  below). The Vault is search-only now (Pages + Links + Search rebuild): no
   *  Folder browsing/selection to disambiguate from any more. */
  const [selectedVaultCardId, setSelectedVaultCardId] = useState<string | null>(null);
  /** Non-null while the selected vault Card's click-through detail view (links +
   *  Nearby — VaultCardDetail.tsx) is open. Deliberately independent of selection
   *  itself: selecting a Card (a plain click/tap, IDE-file-manager style) only ever
   *  selects it, never opens anything — the Dock's own "Preview" action
   *  (vaultModeActions below) is the one explicit way in, same as Add to Page/Add to
   *  Dock are the explicit ways to actually open it *somewhere*. */
  const [vaultDetailId, setVaultDetailId] = useState<string | null>(null);
  /** Non-null while a vault Card row shows an inline rename input in place of its
   *  label (VaultView.tsx's ItemLabel) — set by the Rename action below. */
  const [vaultRenaming, setVaultRenaming] = useState<string | null>(null);
  /** The Card id "New Card" (vaultNewCard below) most recently created, from the
   *  moment it's created until its very first naming is committed or abandoned —
   *  never touched again after that (a later rename of the same Card is a normal
   *  rename). Drives VaultView.tsx's renamingIsNewCard (blank rename input, no
   *  "Untitled" default). */
  const [vaultNewCardId, setVaultNewCardId] = useState<string | null>(null);
  /** The magic button's rewrite-in-place text box (onRewriteSelected above) — open
   *  while the selectedCards row shows the instruction input instead of its normal
   *  actions. Reset below whenever the selection changes or editing starts, so it
   *  never lingers open pointed at a Card that's no longer selected. */
  const [rewriteBoxOpen, setRewriteBoxOpen] = useState(false);
  const [rewriteText, setRewriteText] = useState("");
  /** The quick-lookup/prompt panel — appears automatically the moment anything is
   *  selected: one or more Cards (selectedCards — same multi-selection Save/Hide/
   *  Move/removeSelected already batch over), one or more embeds (selectedEmbedIds
   *  — App.tsx's selectEmbed), one or more Quotes (quotesRegistry.ts), or any
   *  combination. No separate reveal step. *Adds* a panel above the row rather than
   *  replacing it — the row keeps showing whatever it normally would (the WYSIWYG
   *  formatting toolbar while editing, or the ordinary action row otherwise), so a
   *  live text selection can still be formatted normally. Turning a selection into a
   *  Quote is SelectionMenu.tsx's own quotation-mark button, shown right on the
   *  selection itself, not a Dock action. Asking sends the combined content of every
   *  selected Card/embed plus every Quote as context — see buildLookupContextText
   *  below. Never shown during Move Mode (showLookupRow below), so there's always a
   *  way to cancel an in-flight move. Stays open across Add to page/Add to Dock —
   *  those are side-effect-only actions now, they don't dismiss anything — and even
   *  after every Card/Quote/embed clears, until explicitly dismissed via its own
   *  close button (dismissLookup). The one thing that *does* reset it on its own is
   *  the underlying selection itself *changing* (the selectionSignature effect
   *  below) — a different set of Cards/Quotes/embeds is a different topic, so the
   *  old question/answer history no longer applies, but the selection change itself
   *  is never undone by this — only dismissLookup touches Quotes/selection. */
  const [lookupInstruction, setLookupInstruction] = useState("");
  // Every past question/answer for the *current* selection, oldest first — same
  // "iterations" shape as the "prompt" CardType's own metadata.prompt.iterations
  // (cardMetadata.ts), just kept as local component state instead of persisted:
  // this panel's whole context resets the moment the selection changes anyway (see
  // below), so there's nothing meaningful to persist across a reload.
  const [lookupIterations, setLookupIterations] = useState<{ instruction: string; text: string }[]>([]);
  const [lookupActiveIndex, setLookupActiveIndex] = useState(0);
  // Flips the panel from the ask input over to the rendered result the moment a
  // question is sent — same 3D flip mechanic as the "prompt" CardType's own
  // PromptCardBody.tsx (front face = input, back face = rendered output).
  const [lookupFlipped, setLookupFlipped] = useState(false);
  const quotes = useQuotes();
  const lookup = useSelectionLookup();
  const lookupActiveIndexClamped =
    lookupIterations.length === 0 ? 0 : Math.min(Math.max(lookupActiveIndex, 0), lookupIterations.length - 1);
  const activeLookupIteration = lookupIterations[lookupActiveIndexClamped] ?? null;
  // Whenever a new iteration lands, jump straight to it — browsing to an older one
  // via the rail's prev/next (goToLookupIteration) doesn't change `.length`, so it
  // doesn't retrigger this.
  useEffect(() => {
    setLookupActiveIndex(lookupIterations.length - 1);
  }, [lookupIterations.length]);
  const lookupActive =
    selectedCards.length > 0 ||
    selectedEmbedIds.size > 0 ||
    quotes.length > 0 ||
    lookup.streaming ||
    lookupIterations.length > 0 ||
    !!lookup.error;
  // The moment the underlying selection (which Cards/embeds/Quotes) actually
  // changes, the whole question/answer history resets — a different selection is a
  // different topic, so the old iterations no longer apply. Deliberately doesn't
  // touch selectedCards/selectedEmbedIds/quotes themselves (those changing is what
  // triggers this, not something this responds by further mutating) — only
  // dismissLookup's own explicit close button does that (clearQuotes). Skipped on
  // mount (the ref starts equal to the first signature) and whenever there's
  // nothing yet to reset, so selecting the very first Card doesn't do anything.
  const selectionSignature = [
    "c:" + selectedCards.map((pc) => pc.id).sort().join(","),
    "e:" + [...selectedEmbedIds].sort().join(","),
    "q:" + quotes.map((q) => q.id).sort().join(","),
  ].join("|");
  const prevSelectionSignatureRef = useRef(selectionSignature);
  /** Bumped on every handleConvertToStandardCard call and every selection change —
   *  checked after each `await` in buildConvertHtml/handleConvertToStandardCard so a
   *  fetch/parse still in flight when the selection moves on (or a second Convert is
   *  fired before the first resolves) can't land its stale result into state after
   *  the fact. */
  const convertRequestIdRef = useRef(0);
  useEffect(() => {
    if (prevSelectionSignatureRef.current === selectionSignature) return;
    prevSelectionSignatureRef.current = selectionSignature;
    if (lookupIterations.length > 0 || lookupInstruction !== "" || lookupFlipped) {
      setLookupInstruction("");
      lookup.reset();
      setLookupIterations([]);
      setLookupActiveIndex(0);
      setLookupFlipped(false);
    }
    // A different selection makes the old convert output/error stale the same way —
    // cleared here rather than left to linger until the panel's own Dismiss. Also
    // invalidates any markdown fetch/parse still in flight (convertRequestIdRef) so
    // it can't land a result for a selection that's no longer current.
    convertRequestIdRef.current++;
    if (convertOutput !== null || convertError !== null || convertLoading) {
      setConvertOutput(null);
      setConvertError(null);
      setConvertLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionSignature]);
  const [processPickerPos, setProcessPickerPos] = useState<{ left: number; bottom: number } | null>(null);
  const processButtonRef = useRef<HTMLDivElement>(null);
  /** "Convert" (selectedCards/quote rows) — same anchored-popover convention as
   *  processPickerPos/processButtonRef above, picking which form to convert the
   *  current selection into. convertOutput/convertError hold the compiled result (or
   *  the file-Card error) once a target's actually been picked. Mostly a static
   *  panel, not a live generation — convertLoading is the one exception, true only
   *  while a selected markdown File Card's raw text is being fetched/parsed
   *  (markdownToWattleHtml.ts), the one genuinely async part of an otherwise
   *  synchronous compile. */
  const [convertPickerPos, setConvertPickerPos] = useState<{ left: number; bottom: number } | null>(null);
  const convertButtonRef = useRef<HTMLDivElement>(null);
  const [convertOutput, setConvertOutput] = useState<string | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  /** "Insert card link"/"insert field" (rich-text follow-up to the Apps feature) —
   *  every rich-text insert action lives here now, not a Card's own header (see
   *  Card.tsx/CardRichText.tsx). Same anchored-popover convention as
   *  processPickerPos/processButtonRef above. */
  const [linkPickerPos, setLinkPickerPos] = useState<{ left: number; bottom: number } | null>(null);
  const linkButtonRef = useRef<HTMLDivElement>(null);
  /** "Insert Page link" (Pages + Links + Search rebuild, Phase 2) — same
   *  anchored-popover convention as linkPickerPos/linkButtonRef above, just for a
   *  `pageLink` node (a destination) instead of a `cardEmbed` (composed content). */
  const [pageLinkPickerPos, setPageLinkPickerPos] = useState<{ left: number; bottom: number } | null>(null);
  const pageLinkButtonRef = useRef<HTMLDivElement>(null);
  const [fieldKindPickerPos, setFieldKindPickerPos] = useState<{ left: number; bottom: number } | null>(null);
  const fieldButtonRef = useRef<HTMLDivElement>(null);
  /** "Insert link" (a plain `<a href>` mark, distinct from "insert card link"'s
   *  `[[cardId]]` embed above) — same anchored-popover convention as
   *  linkPickerPos/linkButtonRef. */
  const [linkUrlPickerPos, setLinkUrlPickerPos] = useState<{ left: number; bottom: number } | null>(null);
  const hyperlinkButtonRef = useRef<HTMLDivElement>(null);
  /** "Insert callout" — same anchored-popover convention as fieldKindPickerPos
   *  above, picking which of the five fixed kinds (richText/calloutNode.ts) to
   *  insert. */
  const [calloutPickerPos, setCalloutPickerPos] = useState<{ left: number; bottom: number } | null>(null);
  const calloutButtonRef = useRef<HTMLDivElement>(null);
  /** "Insert image" — no popover of its own; the toolbar button just clicks this
   *  hidden native file input, same trigger-a-hidden-input pattern
   *  FeedInputButton.tsx's own upload action uses. */
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  /** "Upload" — the vault-browsing row's own upload action (see vaultModeActions'
   *  "nothing selected" branch below), same trigger-a-hidden-input pattern as
   *  imageFileInputRef above. */
  const vaultFileInputRef = useRef<HTMLInputElement>(null);

  // The formatting toolbar's target — whichever CardRichText instance was most
  // recently focused (activeEditorRegistry.ts), reactively re-read here since Dock is
  // a sibling, not an ancestor, of wherever that editor actually lives in the tree.
  const activeEditor = useActiveEditor();
  // Distinct from `isEditingActive`: that prop stays true for as long as editing is
  // open at all, including while a plain (non-TipTap) title field has focus instead
  // of the rich-text body — this tracks focus itself, so the row below can hide the
  // formatting buttons specifically for that title-field moment (see the `actions`
  // ternary further down).
  const activeEditorFocused = useActiveEditorFocused();
  // The selected Stack's active alternate — Save/Remove for it render in this row
  // (below) rather than as inline buttons on the Card itself (activeStackRegistry.ts).
  const activeStack = useActiveStackControls();
  const formattingState = useEditorState({
    editor: activeEditor,
    selector: ({ editor }: { editor: Editor | null }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      strike: editor?.isActive("strike") ?? false,
      underline: editor?.isActive("underline") ?? false,
      // 0 = no heading active (a plain paragraph) — drives formatHeading's cycle
      // (paragraph -> H1 -> H2 -> … -> H6 -> paragraph) below.
      headingLevel:
        ([1, 2, 3, 4, 5, 6] as const).find((level) => editor?.isActive("heading", { level }) ?? false) ?? 0,
      bulletList: editor?.isActive("bulletList") ?? false,
      orderedList: editor?.isActive("orderedList") ?? false,
      blockquote: editor?.isActive("blockquote") ?? false,
      codeBlock: editor?.isActive("codeBlock") ?? false,
      link: editor?.isActive("link") ?? false,
      linkHref: (editor?.getAttributes("link").href as string | undefined) ?? "",
      taskList: editor?.isActive("taskList") ?? false,
      insideTable: editor?.isActive("table") ?? false,
    }),
  });

  /** Clears every piece of vault-panel-local selection state — used whenever the
   *  panel closes, so reopening it starts fresh rather than resuming mid-rename at
   *  some Card that may not even be in the results any more. */
  function closeVaultSelection() {
    setSelectedVaultCardId(null);
    setVaultDetailId(null);
    setVaultRenaming(null);
  }

  /** Same "never during Move Mode" reasoning showLookupRow below also uses — the
   *  convert output/error panel. Computed first so showLookupRow can hide itself
   *  while this is up (see showLookupRow's own doc comment) — the ask box and the
   *  convert result never make sense stacked at the same time, and with two
   *  max-height:40vh panels both mounted, a multi-Card convert result (taller than
   *  a single Card's) was the one actually getting squeezed out of view under the
   *  still-visible ask box, which read as "compiling multiple Cards is broken"
   *  even though the compiled content itself was always complete. */
  const showConvertPanel =
    (convertOutput !== null || convertError !== null || convertLoading) &&
    !moving &&
    !dockCardMoving &&
    !embedMoving;

  /** Never shown during Move Mode (of any kind) — otherwise a stray leftover text
   *  selection from before the move started would strand the user with no visible
   *  way to cancel it (the row would show the lookup UI instead of Cancel). Also
   *  never shown alongside the convert output panel (showConvertPanel above) — see
   *  its own doc comment for why. */
  const showLookupRow = lookupActive && !showConvertPanel && !moving && !dockCardMoving && !embedMoving;

  /** The panel's own explicit close button — the *only* thing that clears the
   *  underlying selection (every Quote, via clearQuotes; selectedCards/
   *  selectedEmbedIds are App.tsx state, deselected the same way they always are —
   *  tapping each one, or the row's own back-caret) alongside the question/answer
   *  history itself. Everything else (Add to page/Dock, Ask again, browsing past
   *  outputs) leaves both the selection and the history alone. */
  function dismissLookup() {
    setLookupInstruction("");
    lookup.reset();
    setLookupIterations([]);
    setLookupActiveIndex(0);
    setLookupFlipped(false);
    clearQuotes();
  }

  /** The back face's own rail "Ask again"/edit button — same as PromptCardBody.tsx's
   *  rail edit button, just flips back to the front face to send another question.
   *  Every past iteration, the current selection, and whatever's typed in the
   *  instruction box all stay exactly as they are — sending appends a *new*
   *  iteration (handleAskLookup) rather than replacing anything. */
  function handleAskAgain() {
    setLookupFlipped(false);
  }

  /** Same "live cardStore wins once saved" precedence Card.tsx's own canonicalCard
   *  uses (useCard/editCard) — a saved Card's `pc.card` is only as fresh as the last
   *  listPages fetch, so an edit made moments ago (through this same Card open
   *  elsewhere, or through an embed) writes straight to the shared cardStore cache
   *  and wouldn't show up in `pc.card` until the next refresh() round-trips. A
   *  hidden Card is the case that actually surfaces this in practice: PageStack.tsx
   *  never mounts its CardView (and the useCard subscription that keeps Card.tsx's
   *  own display in sync) while revealHidden is off, so nothing ever nudges its
   *  `pages`-state entry to catch up — this one-shot getCachedCard read goes
   *  straight to the same cache canonicalCard already prefers, hidden or not. */
  function resolveCanonicalCard(pc: PageCardWithCard): Card {
    return getCachedCard(pc.card.id) ?? pc.card;
  }

  /** Mirrors Card.tsx's own `content` derivation: a saved Card reads through the
   *  live cache, an unsaved (still page-local scratch) Card reads its own pending
   *  draft instead. Falls back to `pc.card.content` — always fully populated
   *  straight off the last `listPages` fetch, hidden or not (usePages.ts's refresh
   *  calls publishCard for every pageCard unconditionally) — whenever that first
   *  choice comes back empty rather than genuinely missing: a hidden Card's
   *  `draftContent` in particular can be `""` (not null) despite real content
   *  existing, since its CardView/onChangeDraft never mounts to have picked the
   *  real content up in the first place while it's never been revealed, and `??`
   *  alone doesn't fall through on `""`. */
  function resolveCardContent(pc: PageCardWithCard): string {
    const preferred = pc.card.savedToVault ? resolveCanonicalCard(pc).content : (pc.draftContent ?? pc.card.content);
    return preferred || pc.card.content;
  }

  /** A "file"-typed Card's own upload metadata (cardMetadata.ts's `file` field) if
   *  it's markdown (isMarkdownFile.ts — shared with FileView.tsx's own read-only
   *  preview), else null. The one thing that actually distinguishes a convertible
   *  File Card from every other one: markdownToWattleHtml.ts can parse a .md/
   *  .markdown upload into real Wattle rich text; a PDF, image, or anything else
   *  genuinely has no HTML-shaped content to compile at all. */
  function markdownFileMeta(card: Card): { originalName: string; mimeType: string } | null {
    if (getCardTypeId(card) !== "file") return null;
    const file = card.metadata.file;
    if (!file || !isMarkdownFile(file.originalName, file.mimeType)) return null;
    return file;
  }

  /** True if any Card feeding the Convert action — a selected Page Card or a
   *  selected embed — is a File Card that ISN'T markdown. A markdown File Card is
   *  handled by buildConvertHtml below instead (fetched and parsed via
   *  markdownToWattleHtml.ts); every other File Card (a PDF, an image, ...) has no
   *  HTML-shaped content to compile at all — genuinely complicated (the C0 doc's
   *  uploaded-bytes-on-disk model doesn't map onto a plain HTML `content` string the
   *  way every other CardType does) and left for a later stage, so
   *  handleConvertToStandardCard below shows convertError instead for those. */
  function hasSelectedNonMarkdownFileCard(): boolean {
    const isNonMarkdownFile = (card: Card) => getCardTypeId(card) === "file" && !markdownFileMeta(card);
    if (selectedCards.some((pc) => isNonMarkdownFile(resolveCanonicalCard(pc)))) return true;
    return [...selectedEmbedIds]
      .map((cardId) => getCachedCard(cardId))
      .filter((card): card is Card => !!card)
      .some(isNonMarkdownFile);
  }

  /** Fetches a markdown File Card's raw text (same call FileView.tsx's own
   *  read-only preview already makes — getCardFileUrl, the API's file-serving
   *  endpoint) and runs it through the full markdown → Wattle rich-text pipeline.
   *  Throws (caught by handleConvertToStandardCard) on a failed fetch or on
   *  markdownToWattleHtml's own htmlToDoc validation failure — either way, a
   *  half-converted or garbled result should never reach the preview panel. */
  async function fetchAndConvertMarkdownCard(cardId: string): Promise<string> {
    const res = await fetch(getCardFileUrl(cardId));
    if (!res.ok) throw new Error(`Failed to fetch file for Card ${cardId}: ${res.status}`);
    const text = await res.text();
    return convertMarkdownToWattleHtml(text).html;
  }

  /** Compiles every selected Card's/embed's own HTML content plus every confirmed
   *  Quote (wrapped as its own blockquote) into one combined HTML blob — the new
   *  Standard Wattle Card's content when converting a multi-selection. A markdown
   *  File Card's content is fetched and converted (fetchAndConvertMarkdownCard); any
   *  other Card reads through the existing draft-aware/cache-fresh
   *  resolveCardContent. Unlike buildLookupContextText below, this keeps the real
   *  HTML rather than flattening to plain text: the whole point of "convert" is a
   *  real, editable Card at the end, not a text summary for a model prompt. Async
   *  only because of that markdown fetch — every other source resolves
   *  synchronously, but Promise.all doesn't care either way. */
  async function buildConvertHtml(): Promise<string> {
    const cardHtmlPromises = selectedCards.map((pc) => {
      const canonical = resolveCanonicalCard(pc);
      const markdown = markdownFileMeta(canonical);
      return markdown ? fetchAndConvertMarkdownCard(canonical.id) : Promise.resolve(resolveCardContent(pc));
    });
    const embedHtmlPromises = [...selectedEmbedIds]
      .map((cardId) => getCachedCard(cardId))
      .filter((card): card is Card => !!card)
      .map((card) => {
        const markdown = markdownFileMeta(card);
        return markdown ? fetchAndConvertMarkdownCard(card.id) : Promise.resolve(card.content);
      });
    const quoteBlocks = quotes.map(
      (q) => `<blockquote><p>${escapeHtml(q.text).replace(/\n/g, "<br>")}</p></blockquote>`,
    );
    const [cardBlocks, embedBlocks] = await Promise.all([
      Promise.all(cardHtmlPromises),
      Promise.all(embedHtmlPromises),
    ]);
    return [...cardBlocks, ...embedBlocks, ...quoteBlocks].join("<hr>");
  }

  /** The Convert popover's only working option today (see ConvertPicker.tsx) —
   *  compiles the current selection into one combined blob and shows it in the
   *  convert-output panel below, same "review before it lands anywhere" shape as
   *  the lookup panel's own result face, reusing its own Add to Page/Add to Dock
   *  (quickAddRegistry.ts) rather than a new endpoint, since the target really is
   *  just "a new blank-title note Card with this HTML content". Async (unlike every
   *  other Dock action) purely because a selected markdown File Card's content has
   *  to be fetched first — convertLoading covers that window, and
   *  convertRequestIdRef guards against the selection moving on (or a second
   *  Convert firing) before it resolves. */
  async function handleConvertToStandardCard() {
    setConvertPickerPos(null);
    if (hasSelectedNonMarkdownFileCard()) {
      setConvertOutput(null);
      setConvertError(t("dock.convert.fileError"));
      return;
    }
    setConvertError(null);
    setConvertOutput(null);
    const requestId = ++convertRequestIdRef.current;
    setConvertLoading(true);
    try {
      const html = await buildConvertHtml();
      if (convertRequestIdRef.current !== requestId) return;
      setConvertOutput(html);
    } catch {
      if (convertRequestIdRef.current !== requestId) return;
      setConvertError(t("dock.convert.markdownError"));
    } finally {
      if (convertRequestIdRef.current === requestId) setConvertLoading(false);
    }
  }

  function toggleConvertPicker() {
    setConvertPickerPos((open) => {
      if (open) return null;
      const rect = convertButtonRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return { left: rect.left, bottom: window.innerHeight - rect.top + 4 };
    });
  }

  function dismissConvertOutput() {
    // Bumped so a fetch/parse still in flight can't land its result after the panel
    // was explicitly dismissed mid-load.
    convertRequestIdRef.current++;
    setConvertOutput(null);
    setConvertError(null);
    setConvertLoading(false);
  }

  /** Combines every selected Card's own (draft-aware) plain-text content, every
   *  selected embed's own content (a plain cardStore cache read, not a live
   *  subscription — embeds are rarely mid-edit while also gathering lookup context,
   *  and Dock re-renders often enough regardless that this stays close enough to
   *  fresh), and every confirmed Quote into one context blob for the lookup/prompt
   *  endpoint — same draft-over-committed precedence every other read of a
   *  PageCard's content in this app uses. */
  function buildLookupContextText(): string {
    const cardBlocks = selectedCards.map((pc) => {
      const title = pc.draftTitle ?? pc.card.title;
      const content = pc.draftContent ?? pc.card.content;
      const text = flattenToPlainText(htmlToDoc(content)).text;
      return `[Card: ${title || t("common.untitled")}]\n${text}`;
    });
    const embedBlocks = [...selectedEmbedIds]
      .map((cardId) => getCachedCard(cardId))
      .filter((card): card is Card => !!card)
      .map((card) => `[Card: ${card.title || t("common.untitled")}]\n${flattenToPlainText(htmlToDoc(card.content)).text}`);
    const quoteBlocks = quotes.map((q) => `[Quote]\n${q.text}`);
    return [...cardBlocks, ...embedBlocks, ...quoteBlocks].join("\n\n");
  }

  /** "12 words, 2 cards, 1 quote" — a plain word count across every selected Card's/
   *  embed's own content plus every Quote's text, alongside how many of each are
   *  selected (embeds count toward the "cards" figure — see the summary JSX below). */
  function countWords(text: string): number {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }
  const lookupWordCount =
    selectedCards.reduce((sum, pc) => {
      const content = pc.draftContent ?? pc.card.content;
      return sum + countWords(flattenToPlainText(htmlToDoc(content)).text);
    }, 0) +
    [...selectedEmbedIds].reduce((sum, cardId) => {
      const card = getCachedCard(cardId);
      return sum + (card ? countWords(flattenToPlainText(htmlToDoc(card.content)).text) : 0);
    }, 0) +
    quotes.reduce((sum, q) => sum + countWords(q.text), 0);

  function handleAskLookup() {
    const text = buildLookupContextText();
    if (!text || lookup.streaming) return;
    const instructionAtSend = lookupInstruction;
    lookup.start(text, instructionAtSend, (output) => {
      setLookupIterations((prev) => [...prev, { instruction: instructionAtSend, text: output }]);
    });
    setLookupFlipped(true);
  }

  /** The back face's rail prev/next (mirrors PromptCardBody.tsx's goToIteration) —
   *  browsing to an older answer doesn't touch `lookupIterations` itself, so the
   *  "jump to the latest on append" effect above doesn't get retriggered by this. */
  function goToLookupIteration(index: number) {
    setLookupActiveIndex(Math.max(0, Math.min(index, lookupIterations.length - 1)));
  }

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
    icon: vaultOpen ? "close" : "search",
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

  // Reveals every hidden Card (card.metadata.hidden) on the current Page — only
  // meaningful in the true default row (nothing selected, not moving), same as
  // vaultAction/dockCardsAction alongside it. `active` (Button.css's .button--pressed)
  // reads as "currently on" the same way a formatting toggle does.
  const revealHiddenAction: DockAction = {
    key: "revealHidden",
    operationId: null,
    icon: "eye",
    label: t("dock.revealHidden"),
    onClick: onToggleRevealHidden,
    active: revealHidden,
  };

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
      } else if (vaultOpen && selectedVaultCardId) {
        onAddVaultCardToDock(selectedVaultCardId);
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

  // Same toggle convention as vaultAction alongside it — stays in the default row,
  // just swaps its icon/label between open and closed rather than disappearing.
  const nearbyLabel = nearbyOpen ? t("dock.nearby.close") : t("dock.nearby.open");
  const nearbyAction: DockAction = {
    key: "nearby",
    operationId: null,
    icon: nearbyOpen ? "close" : "compass",
    label: nearbyLabel,
    onClick: () => (nearbyOpen ? onClosePanel() : onOpenPanel("nearby")),
  };

  const vaultViewContent = renderedPanel === "vault" && (
    <div className="dock__extended-panel-view">
      <VaultView
        query={vaultQuery}
        onQueryChange={onVaultQueryChange}
        searchResults={vaultSearchResults}
        pageResults={vaultPageResults}
        onOpenPage={onOpenPageFromSearch}
        selectedCardId={selectedVaultCardId}
        onSelectCard={(id) => setSelectedVaultCardId((prev) => (prev === id ? null : id))}
        // Only non-null once selection and the explicit "Preview" action
        // (vaultModeActions above) agree on the same Card — selecting a different
        // Card (or nothing) implicitly closes whatever was previewed, same as Rename
        // starting does (see vaultModeActions' vaultRename, which clears this too
        // for the same reason).
        detailCardId={selectedVaultCardId && vaultDetailId === selectedVaultCardId ? vaultDetailId : null}
        // A link/Nearby row *within* the detail view drilling into another Card —
        // unlike onSelectCard (a plain row click, select-only), this both selects
        // *and* keeps the detail view open on the new Card, so "click through them"
        // stays one click each rather than select-then-Preview-again per hop.
        onOpenCardDetail={(id) => {
          setSelectedVaultCardId(id);
          setVaultDetailId(id);
        }}
        onCloseCardDetail={() => setVaultDetailId(null)}
        renamingId={vaultRenaming}
        renamingIsNewCard={vaultRenaming !== null && vaultRenaming === vaultNewCardId}
        onCommitRename={(title) => {
          if (!vaultRenaming) return;
          const id = vaultRenaming;
          setVaultRenaming(null);
          setVaultNewCardId(null);
          // No title required — a Card can have no title by default (see
          // cardService.createCard's own doc comment), so committing blank just sets
          // it, same as any other value, for both a fresh Card and an established one.
          onRenameVaultCard(id, title);
        }}
        onCancelRename={() => {
          if (vaultRenaming !== null && vaultRenaming === vaultNewCardId) {
            // Escape explicitly abandons a just-created Card — a deliberate "never
            // mind" gesture, independent of title policy (unlike committing blank,
            // which now just leaves the Card untitled — see onCommitRename above).
            onDeleteVaultCard(vaultRenaming);
            setSelectedVaultCardId(null);
          }
          setVaultRenaming(null);
          setVaultNewCardId(null);
        }}
      />
    </div>
  );

  /**
   * Actions for the Vault panel itself — either whatever Card is selected *within*
   * it, or, once nothing is selected and there's no search active, the panel's own
   * creation actions (New Card/Upload — VaultView.tsx no longer has a toolbar of its
   * own for these, same "everything reachable from the Dock" convention every other
   * action already follows). Takes priority over selectedEmbedId/selectedCards below
   * while the panel's open, since that's the more specific, more recent thing the
   * user pointed at. Falls through to the usual Page/Card row only while the panel
   * is closed or actively searching, so opening the panel over an already-selected
   * Page Card doesn't blank the row out.
   */
  let vaultModeActions: DockAction[] | null = null;
  if (vaultOpen && selectedVaultCardId) {
    const cardId = selectedVaultCardId;
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
        key: "vaultAddToDock",
        operationId: null,
        icon: "tray" as const,
        label: t("dock.action.addToDock"),
        onClick: () => {
          onAddVaultCardToDock(cardId);
          closeVaultSelection();
        },
      },
      {
        key: "vaultPreview",
        operationId: null,
        icon: "expand" as const,
        label: t("dock.action.preview"),
        onClick: () => setVaultDetailId(cardId),
      },
      {
        key: "vaultRename",
        operationId: null,
        icon: "edit" as const,
        label: t("dock.action.rename"),
        onClick: () => {
          setVaultDetailId(null);
          setVaultRenaming(cardId);
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
          setSelectedVaultCardId(null);
          setVaultDetailId(null);
        },
      },
    ];
  } else if (vaultOpen && !selectedVaultCardId && !vaultQuery && !selectedEmbedId && selectedCards.length === 0) {
    // Nothing selected, no search active — creation actions move down into this
    // same row rather than living as buttons inside VaultView's own toolbar, same
    // "everything reachable from the Dock" convention every other action in this
    // app already follows. Each is left out entirely (rather than shown disabled)
    // when its creator prop is absent, same convention onAddVaultCardToPage above
    // already uses. Gated on nothing being selected on the Page either (same as
    // this variable's own doc comment above), so opening Vault over an
    // already-selected Page Card still falls through to that Card's own row
    // instead of stealing it — the reason vaultModeActions can be null even while
    // vaultOpen is true.
    vaultModeActions = [
      ...(onCreateVaultCard
        ? [
            {
              key: "vaultNewCard",
              operationId: null,
              icon: "plus" as const,
              label: t("vault.create"),
              onClick: async () => {
                const card = await onCreateVaultCard();
                setSelectedVaultCardId(card.id);
                setVaultNewCardId(card.id);
                setVaultRenaming(card.id);
              },
            },
          ]
        : []),
      ...(onUploadVaultFile
        ? [
            {
              key: "vaultUpload",
              operationId: null,
              icon: "upload" as const,
              label: t("vault.upload"),
              onClick: () => vaultFileInputRef.current?.click(),
            },
          ]
        : []),
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
    // No title required to save (a Card can have no title by default — see
    // cardService.createCard's own doc comment).
    const hasUnsavedDraft = selectedCards.some(
      (pc) => pc.draftTitle !== null || pc.draftContent !== null || !pc.card.savedToVault,
    );
    // Only show an action every selected Card's own CardType actually supports —
    // the intersection, not the union, since e.g. Save shouldn't appear at all if
    // even one selected Card's type doesn't allow it.
    const available = selectedCards
      .map((pc) => supportedOperationIds(getCardTypeId(pc.card)))
      .reduce((a, b) => new Set([...a].filter((id) => b.has(id))));
    // Whether a Stack's own generation targets its active alternate instead of the
    // page-level generate below — only meaningful for a single selected Stack, same
    // "single selection only" scoping processActions/pendingDiffCount already use.
    const isStackSelected =
      selectedCards.length === 1 && getCardTypeId(selectedCards[0].card) === "stack";
    // Whether the Hide action should read "Show" instead — true only once every
    // selected Card is already hidden, same "every, not some" bulk-toggle
    // convention a "select all" checkbox uses; a mixed selection (some hidden,
    // some not) defaults back to "Hide", which then hides the rest too.
    const allSelectedHidden = selectedCards.every((pc) => pc.card.metadata.hidden);
    // "Generate", for a selected Stack, targets the Stack's own generation instance
    // (activeStackRegistry.ts) instead of the rewrite-in-place flow below: it appends
    // a new alternate and streams into *that*. For any other selected Card, the same
    // button instead opens the rewrite text box (rewriteBoxOpen) rather than firing
    // anything immediately — see onRewriteSelected's doc comment above.
    const stackGenerating = isStackSelected && !!activeStack?.isGenerating;
    const generateOnClick = isStackSelected
      ? stackGenerating
        ? activeStack?.stopGenerating
        : activeStack?.generateNewAlternate
      : () => setRewriteBoxOpen(true);
    modeActions = [
      {
        key: "back",
        operationId: null,
        icon: "back" as const,
        label: t("dock.action.back"),
        onClick: onDeselectAll,
      },
      // Rewrite-in-place/"append a new alternate" only ever makes sense against a
      // single definite target (a diff needs one Card's content to anchor against;
      // a Stack's own generation needs one Stack to append to) — hidden entirely
      // once a second Card joins the selection rather than trying to generalize it.
      ...(selectedCards.length === 1
        ? [
            {
              key: "generateSelected",
              operationId: null,
              icon: stackGenerating ? ("stop" as const) : ("generate" as const),
              spin: stackGenerating,
              label: stackGenerating ? t("feedInput.stopGeneration") : t("feedInput.generate"),
              onClick: generateOnClick ?? (() => setRewriteBoxOpen(true)),
            },
          ]
        : []),
      // Freeze (Open/Frozen — Wattle vault plan): only offered for a single, already-
      // saved, still-Open Card — nothing to freeze yet if it's still page-local
      // scratch content or a draft is pending (hasUnsavedDraft), and freezing an
      // already-Frozen Card is meaningless (cardService.freezeCard would just throw).
      ...(selectedCards.length === 1 &&
      selectedCards[0].card.savedToVault &&
      !selectedCards[0].card.frozenAt &&
      !hasUnsavedDraft
        ? [
            {
              key: "freeze",
              operationId: "card.freeze",
              icon: "lock" as const,
              label: t("dock.action.freeze"),
              onClick: onFreezeSelected,
            },
          ]
        : []),
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
      // The selected Stack's active alternate — Save acts on whichever member
      // CardStackRail currently has in view (activeStackRegistry.ts), not the
      // container itself (which never has anything of its own to save — see
      // stackCardType.ts). Kept out of the generic `save` action above since that one
      // is gated on operationId "card.save", which a Stack container never supports.
      // Same position in the row as the generic `save` above (before Move) — the two
      // are mutually exclusive (a Stack container never matches hasUnsavedDraft), so
      // this just fills the same "Save" slot for a Stack selection instead.
      ...(isStackSelected && activeStack?.hasUnsavedDraft
        ? [
            {
              key: "saveStackAlternate",
              operationId: null,
              icon: "save" as const,
              label: t("cardStack.save"),
              onClick: activeStack.save,
            },
          ]
        : []),
      {
        key: "move",
        operationId: null,
        icon: "move" as const,
        label: t("dock.action.move"),
        onClick: onEnterMoveMode,
      },
      {
        key: "toggleHidden",
        operationId: null,
        icon: allSelectedHidden ? ("eye" as const) : ("eyeOff" as const),
        label: allSelectedHidden ? t("dock.action.show") : t("dock.action.hide"),
        onClick: onToggleHiddenSelected,
      },
      // Opens ConvertPicker anchored to its own button (same as "process" above),
      // rather than firing an action directly.
      {
        key: "convert",
        operationId: null,
        icon: "convert" as const,
        label: t("dock.action.convert"),
        onClick: toggleConvertPicker,
      },
      // No separate Move to Dock: dropping onto the Dock is now one of Move's own
      // destinations — tap the Dock Cards toggle itself while moving (see
      // dockCardsAction below). No "Make a Stack" action here either — that lives
      // directly on the Card itself (its header's "+" button, Card.tsx/
      // StackBody.tsx/FileView.tsx) rather than the Dock.
      {
        key: "removeSelected",
        operationId: null,
        icon: "close" as const,
        label: t("card.remove"),
        onClick: onRemoveSelected,
        danger: true,
      },
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
  } else if (quotes.length > 0) {
    // A Quote selected on its own (text highlighted via SelectionMenu.tsx, with no
    // Page Card itself selected) — just enough of a row to get to Convert, same
    // back-caret/dismiss convention as the other selection rows above.
    modeActions = [
      {
        key: "backQuotes",
        operationId: null,
        icon: "back" as const,
        label: t("dock.action.back"),
        onClick: clearQuotes,
      },
      // Opens the same ConvertPicker as the selectedCards row's own Convert.
      {
        key: "convertQuotes",
        operationId: null,
        icon: "convert" as const,
        label: t("dock.action.convert"),
        onClick: toggleConvertPicker,
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

  // The formatting tools themselves — only actually shown while the rich-text body
  // has focus (activeEditorFocused), not merely while editing is open, so they don't
  // sit there uselessly (and inapplicably — `activeEditor` may not even be the field
  // that's focused) while the Card's title field, a plain non-TipTap input, has focus
  // instead. See formattingActions below for the row this feeds into.
  const formatToolActions: DockAction[] = [
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
      key: "formatStrike",
      operationId: null,
      icon: "strikethrough" as const,
      label: t("dock.action.strikethrough"),
      onClick: () => activeEditor?.chain().focus().toggleStrike().run(),
      active: formattingState?.strike ?? false,
      disabled: !activeEditor,
    },
    {
      key: "formatUnderline",
      operationId: null,
      icon: "underline" as const,
      label: t("dock.action.underline"),
      onClick: () => activeEditor?.chain().focus().toggleUnderline().run(),
      active: formattingState?.underline ?? false,
      disabled: !activeEditor,
    },
    {
      key: "formatHeading",
      operationId: null,
      icon: "heading" as const,
      label: t("dock.action.heading"),
      // Cycles paragraph -> H1 -> H2 -> … -> H6 -> paragraph on repeated clicks,
      // rather than a fixed single level — StarterKit's Heading already supports
      // every level 1-6 (input rules "# " through "###### " already work today),
      // this just gives the toolbar a way to reach them all with one button
      // instead of a level picker.
      onClick: () => {
        if (!activeEditor) return;
        const level = formattingState?.headingLevel ?? 0;
        if (level >= 6) {
          activeEditor.chain().focus().setParagraph().run();
        } else {
          activeEditor
            .chain()
            .focus()
            .setHeading({ level: (level + 1) as 1 | 2 | 3 | 4 | 5 | 6 })
            .run();
        }
      },
      active: (formattingState?.headingLevel ?? 0) > 0,
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
    {
      key: "formatTaskList",
      operationId: null,
      icon: "taskList" as const,
      label: t("card.insertTaskList"),
      onClick: () => activeEditor?.chain().focus().toggleTaskList().run(),
      active: formattingState?.taskList ?? false,
      disabled: !activeEditor,
    },
    {
      key: "formatBlockquote",
      operationId: null,
      icon: "blockquote" as const,
      label: t("dock.action.blockquote"),
      onClick: () => activeEditor?.chain().focus().toggleBlockquote().run(),
      active: formattingState?.blockquote ?? false,
      disabled: !activeEditor,
    },
    {
      key: "formatCodeBlock",
      operationId: null,
      icon: "codeBlock" as const,
      label: t("dock.action.codeBlock"),
      onClick: () => activeEditor?.chain().focus().toggleCodeBlock().run(),
      active: formattingState?.codeBlock ?? false,
      disabled: !activeEditor,
    },
    {
      key: "formatHorizontalRule",
      operationId: null,
      icon: "horizontalRule" as const,
      label: t("dock.action.horizontalRule"),
      onClick: () => activeEditor?.chain().focus().setHorizontalRule().run(),
      disabled: !activeEditor,
    },
    // "Insert link" (plain <a href>, distinct from "insert card link" below) opens
    // its own anchored popover (LinkUrlPicker, rendered specially further down)
    // pre-filled with the selection's existing href if the cursor already sits on
    // a link — same "open a popover rather than fire directly" precedent
    // insertCardLink/insertActionField already use.
    {
      key: "formatLink",
      operationId: null,
      icon: "externalLink" as const,
      label: t("card.insertHyperlink"),
      onClick: () => {
        setLinkUrlPickerPos((open) => {
          if (open) return null;
          const rect = hyperlinkButtonRef.current?.getBoundingClientRect();
          if (!rect) return null;
          return { left: rect.left, bottom: window.innerHeight - rect.top + 4 };
        });
      },
      active: formattingState?.link ?? false,
      disabled: !activeEditor,
    },
    {
      key: "insertTable",
      operationId: null,
      icon: "table" as const,
      label: t("card.insertTable"),
      onClick: () => activeEditor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      active: formattingState?.insideTable ?? false,
      disabled: !activeEditor,
    },
    // No popover — clicks straight through to the hidden file input below (same
    // trigger-a-hidden-input shape FeedInputButton.tsx's own upload action uses),
    // uploads, then inserts the resulting URL as an `<img>` node at the cursor.
    {
      key: "insertImage",
      operationId: null,
      icon: "image" as const,
      label: t("card.insertImage"),
      onClick: () => imageFileInputRef.current?.click(),
      disabled: !activeEditor,
    },
    // Opens CalloutKindPicker (rendered specially in the row below, same as
    // insertCardLink/insertActionField) rather than inserting directly — there's no
    // single obvious default kind the way insertActionButton has.
    {
      key: "insertCallout",
      operationId: null,
      icon: "callout" as const,
      label: t("card.insertCallout"),
      onClick: () => {
        setCalloutPickerPos((open) => {
          if (open) return null;
          const rect = calloutButtonRef.current?.getBoundingClientRect();
          if (!rect) return null;
          return { left: rect.left, bottom: window.innerHeight - rect.top + 4 };
        });
      },
      disabled: !activeEditor,
    },
    // Inserts a blank mathInline atom, which MathNodeView.tsx opens straight into
    // its own editing state (empty latex) — no picker/prompt needed here.
    {
      key: "insertMath",
      operationId: null,
      icon: "math" as const,
      label: t("card.insertMath"),
      onClick: () => activeEditor?.chain().focus().insertContent({ type: "mathInline", attrs: { latex: "" } }).run(),
      disabled: !activeEditor,
    },
    // The three rich-text insert actions (Apps feature follow-up) — moved here from
    // a Card's own header (Card.tsx) so every action lives in the Dock. "Insert card
    // link"/"insert field" open their own anchored popover (rendered specially in
    // the row below, same as "process" above) rather than firing immediately;
    // "insert action button" needs no configuration to be usable, so it inserts
    // straight away, same as the formatting toggles above it.
    {
      key: "insertCardLink",
      operationId: null,
      icon: "link" as const,
      label: t("card.insertLink"),
      onClick: () => {
        setLinkPickerPos((open) => {
          if (open) return null;
          const rect = linkButtonRef.current?.getBoundingClientRect();
          if (!rect) return null;
          return { left: rect.left, bottom: window.innerHeight - rect.top + 4 };
        });
      },
      disabled: !activeEditor,
    },
    {
      key: "insertPageLink",
      operationId: null,
      icon: "pages" as const,
      label: t("card.insertPageLink"),
      onClick: () => {
        setPageLinkPickerPos((open) => {
          if (open) return null;
          const rect = pageLinkButtonRef.current?.getBoundingClientRect();
          if (!rect) return null;
          return { left: rect.left, bottom: window.innerHeight - rect.top + 4 };
        });
      },
      disabled: !activeEditor,
    },
    {
      key: "insertActionButton",
      operationId: null,
      icon: "insertButton" as const,
      label: t("card.insertActionButton"),
      onClick: () =>
        activeEditor
          ?.chain()
          .focus()
          .insertContent({
            type: "actionButton",
            attrs: { label: t("actionCard.defaultLabel"), jobId: null, jobParams: "{}" },
          })
          .run(),
      disabled: !activeEditor,
    },
    {
      key: "insertActionField",
      operationId: null,
      icon: "insertTextbox" as const,
      label: t("card.insertActionField"),
      onClick: () => {
        setFieldKindPickerPos((open) => {
          if (open) return null;
          const rect = fieldButtonRef.current?.getBoundingClientRect();
          if (!rect) return null;
          return { left: rect.left, bottom: window.innerHeight - rect.top + 4 };
        });
      },
      disabled: !activeEditor,
    },
  ];

  // The row itself — replaces the whole action row while isEditingActive (below),
  // rather than sitting alongside Save/Move/etc., same "collapse to just what's
  // relevant" convention Move Mode already uses for its own Cancel-only row. Unlike
  // Move Mode's Cancel, this needs its own explicit back-caret rather than relying
  // solely on the existing tap-outside-to-close gesture: while the title field has
  // focus, `formatToolActions` is empty and there'd otherwise be nothing in the row
  // at all to act on. Always present (even with the title field focused) so there's
  // always a way back without having to find the actual Card to click away from.
  const formattingActions: DockAction[] = [
    {
      key: "backFormatting",
      operationId: null,
      icon: "back" as const,
      label: t("dock.action.back"),
      onClick: onExitEditing,
    },
    ...(activeEditorFocused ? formatToolActions : []),
  ];

  // While a Card is in transit (Move Mode), the Dock collapses to just a Cancel
  // action — no Vault toggle, no other actions — so the only thing to do is tap a
  // drop target (PageStack.tsx) or back out. Page Card/embed Move also keeps
  // dockCardsAction in the row alongside Cancel — its own repurposed "drop onto the
  // Dock" destination (see dockCardsAction above); a Dock Card mid-Move has nowhere
  // to drop back onto the Dock, so dockCardMoving doesn't get it.
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
        : embedOrPageCardSelected
          ? (vaultModeActions ?? modeActions)
          : isEditingActive
            ? formattingActions
            : [vaultAction, dockCardsAction, nearbyAction, ...(vaultModeActions ?? modeActions)];

  const rowActions: DockAction[] = actions;

  // True default state only (nothing selected, not editing, not moving) — same
  // condition the row above resolves to its final [vaultAction, dockCardsAction, …]
  // branch. Rendered as its own fixed button *outside* .dock__row (see the JSX
  // below) rather than folded into that array: .dock__row scrolls horizontally once
  // its buttons overflow, and this toggle needs to stay reachable without scrolling
  // to it every time.
  const showRevealHiddenButton =
    !moving && !dockCardMoving && !embedMoving && !isEditingActive && !embedOrPageCardSelected;

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

  const nearbyViewContent = renderedPanel === "nearby" && (
    <div className="dock__extended-panel-view">
      <NearbyPanel
        items={nearbyItems}
        loading={nearbyLoading}
        onOpenCard={(cardId) => {
          onOpenNearbyCard(cardId);
          onClosePanel();
        }}
      />
    </div>
  );

  const pagesViewContent = renderedPanel === "pages" && (
    <div className="dock__extended-panel-view">
      <PagesPanel
        homePageId={homePageId}
        currentPageId={currentPageId}
        onGoHome={() => {
          onGoHome();
          onClosePanel();
        }}
        pinned={pinnedPages}
        isCurrentPagePinned={isCurrentPagePinned}
        onTogglePinCurrent={onTogglePinCurrent}
        onOpenPage={(id) => {
          onOpenPage(id);
          onClosePanel();
        }}
        onSaveAsTemplate={onSaveAsTemplateFromPage}
      />
    </div>
  );

  // Pages/Vault are short-to-medium lists — cap them noticeably smaller than Dock
  // Cards (which can hold a lot more), so they don't take up more space than they
  // need. Vault joins them now that its own toolbar moved down into this row
  // (VaultView.tsx is just a search bar + flat rows these days) — a quieter,
  // quicker-glance drawer even though it can still hold as many Cards as before.
  const isCompactPanel = renderedPanel === "pages" || renderedPanel === "vault";

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
      {nearbyViewContent}
      {pagesViewContent}
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
      {editingTemplateName !== null && (
        <button
          type="button"
          className="dock__editing-template-badge"
          onClick={onStopEditingTemplate}
          title={t("templates.stopEditing")}
        >
          {t("templates.editingBadgePrefix")}
          {editingTemplateName}
        </button>
      )}
      {/* The quick-lookup panel — an *addition* above the row, not a replacement of
          it (feedback: it was swapping out the formatting toolbar/normal actions
          entirely, leaving no way to reach them while asking a question). Whatever
          the row below shows — the WYSIWYG formatting toolbar while editing, or the
          ordinary action row otherwise — stays exactly as it is; this floats above
          it as its own independent input, same "extra content needs real room"
          reasoning the error/notice banners already use. Its own close button is the
          only way to dismiss it now that the row's back-caret means something else
          entirely (deselect/exit-editing) and can't double as this. */}
      {showLookupRow && (
        <div className="dock__lookup-panel">
          {/* Same 3D flip mechanic as the "prompt" CardType's own PromptCardBody.tsx
              (PromptCard.css) — front face is the ask input, back face is the
              generated result rendered as its own bordered card rather than bare
              text, flipping over the moment a question is sent (handleAskLookup). */}
          <div className={`dock__lookup-flip${lookupFlipped ? " dock__lookup-flip--flipped" : ""}`}>
            <div
              className={`dock__lookup-face dock__lookup-face--front${lookupFlipped ? " dock__lookup-face--hidden" : ""}`}
            >
              <div className="dock__lookup-ask">
                <input
                  className="dock__lookup-input"
                  value={lookupInstruction}
                  onChange={(e) => setLookupInstruction(e.target.value)}
                  placeholder={t("quickLookup.placeholder")}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") dismissLookup();
                    else if (e.key === "Enter") {
                      e.preventDefault();
                      handleAskLookup();
                    }
                  }}
                />
                <Button
                  iconOnly
                  onClick={handleAskLookup}
                  disabled={
                    lookup.streaming ||
                    (selectedCards.length === 0 && selectedEmbedIds.size === 0 && quotes.length === 0)
                  }
                  aria-label={t("quickLookup.ask")}
                  title={t("quickLookup.ask")}
                >
                  <Icon name="generate" spin={lookup.streaming} />
                </Button>
                <Button
                  iconOnly
                  onClick={dismissLookup}
                  aria-label={t("quickLookup.dismiss")}
                  title={t("quickLookup.dismiss")}
                >
                  <Icon name="close" />
                </Button>
              </div>
              {(selectedCards.length > 0 || selectedEmbedIds.size > 0 || quotes.length > 0) && (
                <div className="dock__lookup-summary">
                  {(() => {
                    const cardCount = selectedCards.length + selectedEmbedIds.size;
                    return (
                      <>
                        {lookupWordCount} word{lookupWordCount === 1 ? "" : "s"}, {cardCount} card
                        {cardCount === 1 ? "" : "s"}, {quotes.length} quote{quotes.length === 1 ? "" : "s"}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
            <div
              className={`dock__lookup-face dock__lookup-face--back${lookupFlipped ? "" : " dock__lookup-face--hidden"}`}
            >
              {/* Same small rail as PromptCardBody.tsx's own (CardStackRail.tsx's
                  "n / total" convention) — the edit button flips back to the front
                  face to ask another question; prev/next browse past answers for
                  the *current* selection without losing any of them. */}
              <div className="dock__lookup-rail">
                <Button
                  iconOnly
                  onClick={handleAskAgain}
                  aria-label={t("quickLookup.askAgain")}
                  title={t("quickLookup.askAgain")}
                >
                  <Icon name="edit" />
                </Button>
                {lookupIterations.length > 1 && (
                  <>
                    <Button
                      iconOnly
                      aria-label={t("cardStack.previous")}
                      title={t("cardStack.previous")}
                      disabled={lookupActiveIndexClamped === 0}
                      onClick={() => goToLookupIteration(lookupActiveIndexClamped - 1)}
                    >
                      <Icon name="up" className="dock__lookup-rail-arrow dock__lookup-rail-arrow--left" />
                    </Button>
                    <span className="dock__lookup-rail-position">
                      {lookupActiveIndexClamped + 1} / {lookupIterations.length}
                    </span>
                    <Button
                      iconOnly
                      aria-label={t("cardStack.next")}
                      title={t("cardStack.next")}
                      disabled={lookupActiveIndexClamped === lookupIterations.length - 1}
                      onClick={() => goToLookupIteration(lookupActiveIndexClamped + 1)}
                    >
                      <Icon name="up" className="dock__lookup-rail-arrow dock__lookup-rail-arrow--right" />
                    </Button>
                  </>
                )}
              </div>
              {lookup.streaming ? (
                <div className="dock__lookup-generating">
                  <Icon name="generate" spin />
                  <span>{t("promptCard.sending")}</span>
                  <Button onClick={lookup.stop}>
                    <Icon name="stop" />
                    {t("promptCard.stop")}
                  </Button>
                </div>
              ) : activeLookupIteration ? (
                <>
                  <div className="dock__lookup-result-card">
                    <CardRichText
                      key={lookupActiveIndexClamped}
                      content={activeLookupIteration.text}
                      onChangeContent={() => {}}
                      editable={false}
                      cardId="quick-lookup-result"
                      ancestorIds={EMPTY_ANCESTOR_IDS}
                      depth={0}
                    />
                  </div>
                  <div className="dock__lookup-actions">
                    <Button onClick={() => quickAddToPage(activeLookupIteration.text)}>
                      <Icon name="plus" />
                      {t("quickLookup.addToPage")}
                    </Button>
                    <Button onClick={() => quickAddToDock(activeLookupIteration.text)}>
                      <Icon name="tray" />
                      {t("quickLookup.addToDock")}
                    </Button>
                    <Button
                      iconOnly
                      onClick={dismissLookup}
                      aria-label={t("quickLookup.dismiss")}
                      title={t("quickLookup.dismiss")}
                    >
                      <Icon name="close" />
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
          {lookup.error && <p className="dock__lookup-error">{lookup.error}</p>}
        </div>
      )}
      {/* Convert's own result panel — same bordered-card-plus-actions shape as the
          lookup panel's back face above (reusing its own CSS classes, per the
          Convert feature's own "appears on the Dock like a prompt output does"
          spec), just without the flip mechanic: this never has a "front face" input
          to flip away from. convertLoading is the one async wrinkle — a selected
          markdown File Card's raw text has to be fetched and parsed
          (markdownToWattleHtml.ts) before there's anything to preview. */}
      {showConvertPanel && (
        <div className="dock__lookup-panel">
          {/* Deliberately just "dock__lookup-face", not "...--back" — that modifier
              only makes sense counter-rotated inside a flipped .dock__lookup-flip
              parent (it'd render upside-down on its own); Convert has no flip
              mechanic to begin with; see handleConvertToStandardCard's own comment. */}
          <div className="dock__lookup-face">
            {convertLoading ? (
              <div className="dock__lookup-generating">
                <Icon name="generate" spin />
                <span>{t("dock.convert.converting")}</span>
              </div>
            ) : convertError ? (
              <p className="dock__lookup-error">{convertError}</p>
            ) : (
              <div className="dock__lookup-result-card">
                <CardRichText
                  content={convertOutput ?? ""}
                  onChangeContent={() => {}}
                  editable={false}
                  cardId="convert-result"
                  ancestorIds={EMPTY_ANCESTOR_IDS}
                  depth={0}
                />
              </div>
            )}
            <div className="dock__lookup-actions">
              {!convertLoading && !convertError && (
                <>
                  <Button onClick={() => quickAddToPage(convertOutput ?? "")}>
                    <Icon name="plus" />
                    {t("quickLookup.addToPage")}
                  </Button>
                  <Button onClick={() => quickAddToDock(convertOutput ?? "")}>
                    <Icon name="tray" />
                    {t("quickLookup.addToDock")}
                  </Button>
                </>
              )}
              <Button
                iconOnly
                onClick={dismissConvertOutput}
                aria-label={t("dock.action.dismiss")}
                title={t("dock.action.dismiss")}
              >
                <Icon name="close" />
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="dock__bottom-row">
        {showRevealHiddenButton && (
          <Button
            iconOnly
            className={`dock__reveal-hidden-button${revealHiddenAction.active ? " button--pressed" : ""}`}
            onClick={revealHiddenAction.onClick}
            aria-label={revealHiddenAction.label}
            title={revealHiddenAction.label}
          >
            <Icon name={revealHiddenAction.icon} />
          </Button>
        )}
        <div className="dock__row">
          {rewriteBoxOpen ? (
            // The magic button's rewrite-in-place text box (onRewriteSelected) —
            // replaces every other selectedCards action while open, same "collapse
            // to just what's relevant" convention formattingActions already uses for
            // isEditingActive. The send button re-lists as the same "generate" icon
            // the row's own magic button already showed — tapping it a second time
            // is what "sends" the typed (or blank) instruction.
            <>
              <Button
                iconOnly
                onClick={() => {
                  setRewriteBoxOpen(false);
                  setRewriteText("");
                }}
                aria-label={t("dock.action.back")}
                title={t("dock.action.back")}
              >
                <Icon name="back" />
              </Button>
              <input
                className="dock__rewrite-input"
                value={rewriteText}
                onChange={(e) => setRewriteText(e.target.value)}
                placeholder={t("dock.action.rewritePlaceholder")}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setRewriteBoxOpen(false);
                    setRewriteText("");
                  } else if (e.key === "Enter") {
                    onRewriteSelected(rewriteText);
                    setRewriteBoxOpen(false);
                    setRewriteText("");
                  }
                }}
              />
              <Button
                iconOnly
                onClick={() => {
                  onRewriteSelected(rewriteText);
                  setRewriteBoxOpen(false);
                  setRewriteText("");
                }}
                aria-label={t("feedInput.generate")}
                title={t("feedInput.generate")}
              >
                <Icon name="generate" />
              </Button>
            </>
          ) : (
            rowActions.map((action, index) => {
            // Vault-specific actions (New Card/Upload with nothing selected;
            // Add to Page/Rename/Delete once a Card in the vault is selected —
            // vaultModeActions above) get a visibly different treatment and a
            // divider ahead of the first one, so they read as their own cluster
            // rather than blending into the row's other actions — the
            // exact toggle button itself (key "vault") is excluded, since that one
            // belongs with dockCardsAction/nearbyAction as a plain panel toggle, not
            // a vault-content action. Same `key.startsWith(...)` convention the
            // onMouseDown formatting-button check below already uses.
            const isVaultAction = action.key !== "vault" && action.key.startsWith("vault");
            const previousAction = index > 0 ? rowActions[index - 1] : undefined;
            const previousIsVaultAction =
              !!previousAction && previousAction.key !== "vault" && previousAction.key.startsWith("vault");
            const showDivider = isVaultAction && !previousIsVaultAction;
            const vaultClass = isVaultAction ? "dock__action--vault" : "";

            return (
            <Fragment key={action.key}>
            {showDivider && <span className="dock__action-divider" aria-hidden="true" />}
            {
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
            ) : action.key === "convert" || action.key === "convertQuotes" ? (
              // Same "needs its own positioned wrapper" reasoning as "process" above
              // — one shared ref, since only one of "convert"/"convertQuotes" is ever
              // present in a given row's actions at once (selectedCards vs. the
              // quotes-only row), so there's no risk of two DOM nodes fighting over it.
              <div key={action.key} className="dock__convert-wrap" ref={convertButtonRef}>
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
            ) : action.key === "insertCardLink" ? (
              <div key="insertCardLink" className="dock__insert-wrap" ref={linkButtonRef}>
                <Button
                  iconOnly
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  aria-label={action.label}
                  title={action.label}
                >
                  <Icon name={action.icon} />
                </Button>
              </div>
            ) : action.key === "insertPageLink" ? (
              <div key="insertPageLink" className="dock__insert-wrap" ref={pageLinkButtonRef}>
                <Button
                  iconOnly
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  aria-label={action.label}
                  title={action.label}
                >
                  <Icon name={action.icon} />
                </Button>
              </div>
            ) : action.key === "insertActionField" ? (
              <div key="insertActionField" className="dock__insert-wrap" ref={fieldButtonRef}>
                <Button
                  iconOnly
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  aria-label={action.label}
                  title={action.label}
                >
                  <Icon name={action.icon} />
                </Button>
              </div>
            ) : action.key === "formatLink" ? (
              <div key="formatLink" className="dock__insert-wrap" ref={hyperlinkButtonRef}>
                <Button
                  iconOnly
                  className={action.active ? "button--pressed" : undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  aria-label={action.label}
                  title={action.label}
                >
                  <Icon name={action.icon} />
                </Button>
              </div>
            ) : action.key === "insertCallout" ? (
              <div key="insertCallout" className="dock__insert-wrap" ref={calloutButtonRef}>
                <Button
                  iconOnly
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  aria-label={action.label}
                  title={action.label}
                >
                  <Icon name={action.icon} />
                </Button>
              </div>
            ) : (
              <Button
                key={action.key}
                iconOnly
                variant={action.danger ? "danger" : "default"}
                className={[action.active ? "button--pressed" : "", vaultClass].filter(Boolean).join(" ") || undefined}
                // Formatting/insert buttons must not steal focus from the
                // ProseMirror contentEditable on mousedown — doing so collapses the
                // text selection/cursor before the click's toggleBold()/insertContent()/
                // etc. command runs. Every other DockAction is a plain fire-and-forget
                // click, so this is scoped to "format*"/"insert*" keys rather than
                // applied to all of them.
                onMouseDown={
                  action.key.startsWith("format") || action.key.startsWith("insert")
                    ? (e) => e.preventDefault()
                    : undefined
                }
                onClick={action.onClick}
                disabled={action.disabled}
                aria-label={action.label}
                title={action.label}
              >
                <Icon name={action.icon} spin={action.spin} />
              </Button>
            )
            }
            </Fragment>
            );
            })
          )}
        </div>
        {/* The Page nav cluster (formerly the standalone PageNav component, merged
            here per feedback) — up/down (the optional sibling trail, Phase 3) /add,
            Home, pin, and the Pages panel toggle, pinned to the bottom-right corner
            of the Dock. (The hidden-Cards reveal toggle used to live here too — it's
            its own DockAction in the default row now, revealHiddenAction above,
            alongside Vault/Dock Cards.) Hidden while a Page Card/embed is selected
            and NOT mid-move (Selection Lock, Step 6 spec §4.3) — a selected *Dock*
            Card deliberately leaves it visible, same as Vault (see
            embedOrPageCardSelected above). Moving either kind of Card (page or Dock)
            is the one deliberate exception to Selection Lock: reaching a destination
            Page that isn't the one currently in view means navigating there first
            (via Search/Home/pins), so this cluster has to stay reachable the whole
            time a move is in progress even though the selection it carries forward
            (handleEnterMoveMode/handleEnterDockCardMoveMode) is still technically
            non-empty. */}
        {(!embedOrPageCardSelected || moving || dockCardMoving) && (
          <div className="dock__page-nav">
            <button
              type="button"
              disabled={!canGoBack}
              onClick={onGoBack}
              aria-label={t("pageStack.back")}
              title={t("pageStack.back")}
            >
              <Icon name="back" />
            </button>
            <button
              type="button"
              className="dock__page-nav-forward"
              disabled={!canGoForward}
              onClick={onGoForward}
              aria-label={t("pageStack.forward")}
              title={t("pageStack.forward")}
            >
              <Icon name="chevronRight" />
            </button>
            {siblingCount > 1 && (
              <>
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
                  disabled={!canNavigateDown}
                  onClick={onNavigateDown}
                  aria-label={t("pageStack.down")}
                  title={t("pageStack.down")}
                >
                  <Icon name="down" />
                </button>
                {/* Position within the sibling trail — same "1/N" convention the old
                    Tab-stack indicator used, now scoped to former stack-mates only. */}
                {siblingIndex !== -1 && (
                  <span className="dock__page-nav-count" aria-hidden="true">
                    {siblingIndex + 1}/{siblingCount}
                  </span>
                )}
              </>
            )}
            <button type="button" onClick={onAddPage} aria-label={t("pageStack.addPage")} title={t("pageStack.addPage")}>
              <Icon name="plus" />
            </button>
            <button
              type="button"
              className={currentPageId === homePageId ? "button--pressed" : undefined}
              onClick={onGoHome}
              disabled={!homePageId || currentPageId === homePageId}
              aria-label={t("pages.home")}
              title={t("pages.home")}
            >
              <Icon name="home" />
            </button>
            <button
              type="button"
              className={isCurrentPagePinned ? "button--pressed" : undefined}
              onClick={onTogglePinCurrent}
              disabled={!currentPageId}
              aria-label={isCurrentPagePinned ? t("pages.unpin") : t("pages.pin")}
              title={isCurrentPagePinned ? t("pages.unpin") : t("pages.pin")}
            >
              <Icon name="pin" />
            </button>
            <button
              type="button"
              onClick={() => (pagesOpen ? onClosePanel() : onOpenPanel("pages"))}
              aria-label={pagesOpen ? t("dock.pages.close") : t("dock.pages.open")}
              title={pagesOpen ? t("dock.pages.close") : t("dock.pages.open")}
            >
              <Icon name={pagesOpen ? "close" : "pages"} />
            </button>
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
      {convertPickerPos && (
        <ConvertPicker
          style={{ left: convertPickerPos.left, bottom: convertPickerPos.bottom }}
          onPickStandardCard={handleConvertToStandardCard}
          onClose={() => setConvertPickerPos(null)}
        />
      )}
      {linkPickerPos && (
        <CardLinkPicker
          style={{
            position: "fixed",
            top: "auto",
            right: "auto",
            left: linkPickerPos.left,
            bottom: linkPickerPos.bottom,
          }}
          excludeSelector=".dock__insert-wrap"
          onSelect={(card: Card) => {
            activeEditor?.chain().focus().insertContent({ type: "cardEmbed", attrs: { cardId: card.id } }).run();
            setLinkPickerPos(null);
          }}
          onClose={() => setLinkPickerPos(null)}
        />
      )}
      {pageLinkPickerPos && (
        <PageLinkPicker
          style={{
            position: "fixed",
            top: "auto",
            right: "auto",
            left: pageLinkPickerPos.left,
            bottom: pageLinkPickerPos.bottom,
          }}
          excludeSelector=".dock__insert-wrap"
          onSelect={(page) => {
            activeEditor
              ?.chain()
              .focus()
              .insertContent({ type: "pageLink", attrs: { pageId: page.id, title: page.title ?? "" } })
              .run();
            setPageLinkPickerPos(null);
          }}
          onClose={() => setPageLinkPickerPos(null)}
        />
      )}
      {fieldKindPickerPos && (
        <ActionFieldKindPicker
          style={{ left: fieldKindPickerPos.left, bottom: fieldKindPickerPos.bottom }}
          excludeSelector=".dock__insert-wrap"
          onSelect={(kind: ActionFieldKind) => {
            activeEditor
              ?.chain()
              .focus()
              .insertContent({ type: "actionField", attrs: defaultActionFieldAttrs(kind) })
              .run();
            setFieldKindPickerPos(null);
          }}
          onClose={() => setFieldKindPickerPos(null)}
        />
      )}
      {linkUrlPickerPos && (
        <LinkUrlPicker
          style={{ left: linkUrlPickerPos.left, bottom: linkUrlPickerPos.bottom }}
          excludeSelector=".dock__insert-wrap"
          initialUrl={formattingState?.linkHref ?? ""}
          onSubmit={(url) => {
            activeEditor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
            setLinkUrlPickerPos(null);
          }}
          onRemove={
            formattingState?.link
              ? () => {
                  activeEditor?.chain().focus().extendMarkRange("link").unsetLink().run();
                  setLinkUrlPickerPos(null);
                }
              : undefined
          }
          onClose={() => setLinkUrlPickerPos(null)}
        />
      )}
      {calloutPickerPos && (
        <CalloutKindPicker
          style={{ left: calloutPickerPos.left, bottom: calloutPickerPos.bottom }}
          excludeSelector=".dock__insert-wrap"
          onSelect={(kind: CalloutKind) => {
            activeEditor
              ?.chain()
              .focus()
              .insertContent({ type: "callout", attrs: { kind }, content: [{ type: "paragraph" }] })
              .run();
            setCalloutPickerPos(null);
          }}
          onClose={() => setCalloutPickerPos(null)}
        />
      )}
      {/* Hidden native file input backing the "insertImage" action above — no
          visible UI of its own, just a click target reached via imageFileInputRef. */}
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        className="dock__hidden-file-input"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || !activeEditor) return;
          const { url } = await uploadRichTextImage(file);
          activeEditor.chain().focus().setImage({ src: url }).run();
        }}
      />
      {/* Hidden native file input backing the vault row's "Upload" action — see
          vaultFileInputRef above. */}
      <input
        ref={vaultFileInputRef}
        type="file"
        className="dock__hidden-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onUploadVaultFile?.(file);
        }}
      />
    </footer>
  );
}

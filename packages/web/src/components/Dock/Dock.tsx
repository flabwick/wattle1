import { Fragment, useEffect, useRef, useState } from "react";
import type {
  Card,
  CalloutKind,
  DockCardWithCard,
  PageCardWithCard,
  PageSummary,
  PageWithCards,
} from "@wattle/shared";
import {
  cardTypeRegistry,
  flattenToPlainText,
  htmlToDoc,
  isEpubFile,
  isHtmlFile,
  isImageFile,
  isPdfFile,
  operationRegistry,
} from "@wattle/shared";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { Button, Icon, InputField } from "../primitives/index.js";
import type { IconName } from "../primitives/Icon.js";
import { VaultView } from "../Vault/VaultView.js";
import { DockCardView } from "./DockCardView.js";
import { DockCardRail } from "./DockCardRail.js";
import { PagesPanel } from "./PagesPanel.js";
import { ConvertPicker } from "./ConvertPicker.js";
import { CalloutKindPicker } from "../Card/richtext/CalloutKindPicker.js";
import { CardRichText } from "../Card/richtext/CardRichText.js";
import {
  createCard,
  createPage,
  divideCardIntoSections,
  extractCardFileText,
  getCardFileUrl,
  uploadRichTextImage,
} from "../../api/client.js";
import { getCardTypeId } from "../../lib/getCardTypeId.js";
import { isMarkdownFile } from "../../lib/isMarkdownFile.js";
import { convertMarkdownToWattleHtml } from "../../lib/markdownToWattleHtml.js";
import { plainTextToWattleHtml } from "../../lib/plainTextToWattleHtml.js";
import { getCachedCard } from "../../lib/cardStore.js";
import { useActiveEditor, useActiveEditorFocused } from "../../lib/activeEditorRegistry.js";
import { clearQuotes, useQuotes } from "../../lib/quotesRegistry.js";
import { useAgentLoop } from "../../hooks/useAgentLoop.js";
import type { GhostCardNode } from "../../hooks/useGeneration.js";
import type { StepOutput } from "../../lib/actionJobRegistry.js";
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
export type DockPanel = "vault" | "pages";

interface DockProps {
  /** Every currently-selected Card — multiple Cards can be selected at once now
   *  (App.tsx's toggleSelectPageCard adds rather than replaces). Save/Hide/Move/
   *  removeSelected/the prompt panel's context all batch over the whole array;
   *  actions that fundamentally need exactly one target (rewrite-in-place, a
   *  selected Stack's own generation, annotate/diff processes) gate on
   *  `.length === 1` and disappear otherwise. Empty when nothing's selected. */
  selectedCards: PageCardWithCard[];
  /** The Page currently in view, full pageCards list included — Quick Lookup's own
   *  "Ask AI" (the Brilliantly Simple Generation Agent, scope: "cards") needs this
   *  for the rest-of-page orientation context alongside `selectedCards` itself; see
   *  useAgentLoop.ts's buildCardsContextText. Null only in the fullscreen
   *  single-Card view, where Ask AI isn't reachable anyway (no multi-Card
   *  selection is possible there). */
  currentPage: PageWithCards | null;
  /** Same ActionJobContext-bound dispatcher PageStack.tsx's own onRunActionJob
   *  prop already is (App.tsx's handleRunActionJob) — Quick Lookup's "Ask AI" runs
   *  tool calls through this exact same path, not a separate one. */
  onRunActionJob: (
    pageCard: PageCardWithCard,
    jobId: string | undefined,
    jobParams: Record<string, unknown> | undefined,
  ) => Promise<StepOutput | void>;
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
  /** The live Card `selectedEmbedId` refers to (App.tsx's own reactive
   *  `useSyncExternalStore(subscribeToCard(...))`, not a one-off cache read) —
   *  the single-embed action row's own Freeze/Hide eligibility and current
   *  hidden state need this to stay correct across a toggle, the same way
   *  `selectedCards` below is always fresh via props rather than re-derived
   *  from a stale snapshot. */
  selectedEmbedCard: Card | null;
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
  /** The row's own back-caret action — a plain deselect, leaving the embed exactly
   *  where it is. Detaching the embed entirely is now its own header's "X"
   *  (CardHeaderActions, CardEmbed.tsx) — same as a top-level Card's own header —
   *  not a Dock row action any more; full vault deletion is reached from the
   *  Vault panel, same as for a top-level Card. */
  onDeselectEmbed: () => void;
  /** "Add to page" — the one selected-embed action with no normal-card
   *  equivalent: appends the embedded Card at the bottom of the current Page as
   *  its own standalone PageCard (api.addExistingCardToPage), alongside staying
   *  embedded right where it is — same "open elsewhere, still the same live
   *  Card" precedent Open from Vault already follows, just from inside an embed's
   *  own selection row instead of the Feed Input Button. */
  onAddEmbedToPage: () => void;
  /** Freezes the selected embed's own underlying Card — same
   *  onFreezeSelected below, just scoped to the one embedded Card
   *  (gated the same way: savedToVault, not already Frozen, no unsaved draft —
   *  though an embed never has one, "no page-local draft for an embed" per
   *  CardEmbed.tsx's own doc comment). */
  onFreezeEmbed: () => void;
  /** Flips `metadata.hidden` on the selected embed's own underlying Card — same
   *  onToggleHiddenSelected below, just scoped to the one embedded Card. */
  onToggleHiddenEmbed: () => void;
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
  /** Flips `metadata.hidden` on every selected Card at once (App.tsx's
   *  handleToggleHiddenSelected) — hidden Cards are skipped during normal Page
   *  rendering unless the Dock's own "reveal hidden cards" toggle (revealHidden
   *  below) is on. Works uniformly across every CardType, so — unlike Save/Move —
   *  it's never gated by operationId/supportsOperations. */
  onToggleHiddenSelected: () => void;
  /** How many pending diff annotations the selected Card/embed currently has — the
   *  "Accept all diffs" action only appears once this is > 0. */
  pendingDiffCount: number;
  onAcceptAllDiffs: (() => void) | null;
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
  /** Page title matches (Pages + Links + Search rebuild, Phase 2) — the Vault panel's
   *  own "Search finds Pages/Cards" half, shown above vaultSearchResults. */
  vaultPageResults: PageSummary[];
  onOpenPageFromSearch: (id: string) => void;
  /** Every Home (Homes + Pages hierarchy, Phase 2) — VaultView's own zero-match
   *  empty-state fallback. */
  vaultHomes: PageSummary[];
  onCreateHome: () => void;
  /** Home button (idle row) — opens the full-page Homes view in App.tsx, mirroring
   *  focusedPageCardId's own fullscreen-overlay pattern rather than this Dock's own
   *  slide-up drawer system (a whole "browse every Home, or make a new one" view
   *  reads as a destination in its own right, not a quick drawer over the page). */
  onOpenHomesPage: () => void;
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
  /** The idle row's own direct "Upload file" action (next to Vault/Dock Cards) —
   *  uploads straight into the Dock as a new Dock Card and opens the Dock Cards
   *  panel onto it in one tap, same land-on-the-new-Card behavior as
   *  onAddVaultCardToDock above, instead of going through the Dock Cards panel's
   *  own buried creation flow (open panel -> "+" -> ellipsis -> File tile). */
  onUploadFileToDock: (file: File) => void;
  /** The Convert menu's OCR/Extract Text/AI Cleanup methods for a PDF/image/HTML/
   *  EPUB File Card (handleConvertFileCard below) — creates the resulting Card
   *  straight in the Dock and opens onto it, same land-on-the-new-Card behavior as
   *  onUploadFileToDock above, no preview step in between. */
  onConvertedCardToDock: (title: string, html: string) => Promise<void>;
  /** The Dock's persistent scratchpad layer (Step 6 spec §1.2/§3.3) — as many Cards
   *  as have been added, though only one is ever shown at a time (Dock.tsx's own
   *  carousel — DockCardRail's subtle side arrows browse between them, "+" once
   *  you're at the end creates a new one). */
  dockCards: DockCardWithCard[];
  /** Reuses the same "editing embed ids" set as page-embedded Cards — edit state is a
   *  property of a Card's id, not of where it's currently displayed, and a Dock Card
   *  behaves exactly like an embed (writes straight through, no draft) — reachable
   *  both via double-click/long-press (same as any other embed) and via the Dock's
   *  own Edit action once a Dock Card is selected (see selectedDockCardIds below). */
  editingDockCardIds: ReadonlySet<string>;
  onToggleDockCardEdit: (cardId: string) => void;
  /** DockCardRail's own "+" — creates a new, blank Dock Card (Dock.tsx's own
   *  carousel lands on it immediately, same "the newest Card is always last, and
   *  I'm already looking at *a* Card so land on the new one" auto-follow every
   *  other creation path here already shares). Returns the created Card so the
   *  blank-state Feed Input Button's own plain "Add" (typed text, bypassing AI)
   *  can fill it via editCard instead — see DockCardView.tsx's own onAddCard. */
  onCreateDockCard: (title: string, content: string) => Promise<DockCardWithCard>;
  /** The idle row's own direct "Upload file" action (uploadDockFileAction) —
   *  mirrors a Page's Feed Input Button Upload; same auto-follow-the-newest-Card
   *  landing as onCreateDockCard above. */
  onUploadDockCardFile: (file: File) => Promise<DockCardWithCard>;
  /** True while a generation is streaming into the Dock's own current (blank) Card
   *  — App.tsx's own useGeneration instance, dedicated to the Dock (separate from
   *  the Page-level one), mirroring StackBody.tsx's own per-Stack instance. Locks
   *  DockCardRail's arrows for the duration, same reasoning as CardStackRail's own
   *  `disabled` during a Stack alternate's generation. */
  dockCardGenerating: boolean;
  dockCardGenerationNodes: Record<number, GhostCardNode>;
  dockCardGenerationRootId: number | null;
  /** Starts a generation that fills the Dock's own current Card in place — only
   *  ever called while that Card is blank (DockCardView's own isBlank check). */
  onGenerateDockCard: (dockCardId: string, instruction?: string) => void;
  onStopDockCardGeneration: () => void;
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
  /** DockCardView's own header shortcuts (App.tsx's handleSendDockCardToPage/
   *  handleCloseDockCard) — the direct, one-click equivalents of
   *  onMoveSelectedDockCardsToPage/onCloseSelectedDockCards above, reachable right
   *  from that Dock Card's own header without needing to select it first. */
  onSendDockCardToPage: (id: string) => void;
  onCloseDockCard: (id: string) => void;
  /** DockCardView's own header "+" — App.tsx's handleTurnDockCardIntoStack. */
  onTurnDockCardIntoStack: (id: string) => void;
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
  /** The full state system's Undo/Redo (manual edits) and version Back/Forward
   *  (generation before/after) — App.tsx's useHistory, auto-scoped to the current
   *  card selection. Named distinctly from canGoBack/canGoForward/onGoBack/
   *  onGoForward above, which are the unrelated *Page*-navigation history. */
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canVersionBack: boolean;
  canVersionForward: boolean;
  onVersionBack: () => void;
  onVersionForward: () => void;
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
 *
 * A `typeId` that isn't currently registered (a stale value left over from a
 * CardType that's since been removed/renamed, e.g. the old "operation" type folded
 * into "action" — see cardMetadata.ts's own migration doc comments) falls back to
 * "note"'s own `["*"]` behavior — same "unrecognized type renders as a plain note"
 * convention PageStack.tsx's own PageCardSlot already uses for the View layer,
 * rather than throwing and taking the whole Dock down.
 */
function supportedOperationIds(typeId: string): Set<string> {
  const registeredIds = operationRegistry.list().map((op) => op.id);
  const cardType = cardTypeRegistry.has(typeId) ? cardTypeRegistry.get(typeId) : cardTypeRegistry.get("note");
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
  currentPage,
  onRunActionJob,
  selectedEmbedIds,
  selectedEmbedId,
  selectedEmbedCard,
  isEditingActive,
  onExitEditing,
  onDeselectEmbed,
  onAddEmbedToPage,
  onFreezeEmbed,
  onToggleHiddenEmbed,
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
  onToggleHiddenSelected,
  pendingDiffCount,
  onAcceptAllDiffs,
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
  onCreateVaultCard,
  onUploadVaultFile,
  onRenameVaultCard,
  onDeleteVaultCard,
  onAddVaultCardToPage,
  onAddVaultCardToDock,
  onUploadFileToDock,
  onConvertedCardToDock,
  dockCards,
  editingDockCardIds,
  onToggleDockCardEdit,
  onCreateDockCard,
  onUploadDockCardFile,
  dockCardGenerating,
  dockCardGenerationNodes,
  dockCardGenerationRootId,
  onGenerateDockCard,
  onStopDockCardGeneration,
  selectedDockCardIds,
  onToggleSelectDockCard,
  onDeselectDockCards,
  onCloseSelectedDockCards,
  onMoveSelectedDockCardsToPage,
  onSendDockCardToPage,
  onCloseDockCard,
  onTurnDockCardIntoStack,
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
  vaultHomes,
  onCreateHome,
  onOpenHomesPage,
  revealHidden,
  onToggleRevealHidden,
  onSaveAsTemplateFromPage,
  editingTemplateName,
  onStopEditingTemplate,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  canVersionBack,
  canVersionForward,
  onVersionBack,
  onVersionForward,
}: DockProps) {
  const vaultOpen = openPanel === "vault";
  const pagesOpen = openPanel === "pages";

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
  /** Which one of `dockCards` the carousel is currently showing — only ever one at a
   *  time (DockCardRail's subtle side arrows browse between them), null only while
   *  the Dock holds no Cards at all. Not derived fresh from `dockCards` on every
   *  render (e.g. "always index 0") because navigating has to *stick* across
   *  re-renders caused by unrelated Dock Card edits elsewhere (useDockCards.ts's
   *  own subscribeToSaves refresh) — this is deliberately its own piece of state,
   *  reconciled against the current `dockCards` list by the effect right below
   *  rather than computed inline. */
  const [currentDockCardId, setCurrentDockCardId] = useState<string | null>(null);
  const prevDockCardCountRef = useRef(dockCards.length);
  useEffect(() => {
    const grew = dockCards.length > prevDockCardCountRef.current;
    prevDockCardCountRef.current = dockCards.length;
    // A Card was added while one was already in view (any creation path — the
    // rail's own "+", a generation landing, the idle row's Upload, or "Add to
    // Dock" from the Vault) — land on it. Every creation path appends, so the
    // newest one is always last.
    if (grew && currentDockCardId !== null) {
      setCurrentDockCardId(dockCards[dockCards.length - 1].id);
      return;
    }
    // First load, or the Card previously in view is gone (closed/moved to a Page/
    // no longer exists) — fall back to the first remaining Card, or nothing.
    if (currentDockCardId === null || !dockCards.some((dc) => dc.id === currentDockCardId)) {
      setCurrentDockCardId(dockCards.length > 0 ? dockCards[0].id : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockCards]);
  const currentDockCardIndex = currentDockCardId ? dockCards.findIndex((dc) => dc.id === currentDockCardId) : -1;
  const currentDockCard = currentDockCardIndex >= 0 ? dockCards[currentDockCardIndex] : null;
  const dockCardAtEnd = dockCards.length === 0 || currentDockCardIndex === dockCards.length - 1;

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
  /** Auto-grow for the ask textarea (.dock__lookup-input, rendered with
   *  `rows={1}` below so its own native intrinsic height — a bare `<textarea>`
   *  defaults to 2 rows otherwise — is already correct before this ever runs,
   *  not just once JS catches up) — starts at one line and grows to fit
   *  whatever's typed, up to the CSS
   *  max-height (50vh) beyond which the textarea's own native scrolling takes
   *  over. Resetting to "auto" before measuring is what lets it *shrink* back
   *  down too (deleting text/clearing the box), not just grow — scrollHeight
   *  alone only ever reports "at least as tall as the current height". Adds the
   *  element's own border width on top of scrollHeight: `scrollHeight` never
   *  counts border (only content + padding — true regardless of box-sizing),
   *  but global.css sets `box-sizing: border-box` app-wide, under which the
   *  `height` this sets *does* include border — without this adjustment the box
   *  ends up a couple px short of its own content on every measurement, which is
   *  exactly what made it look "a bit more than one line" and start scrolling
   *  before it actually needed to. */
  const lookupInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = lookupInputRef.current;
    if (!el) return;
    const borderHeight = el.offsetHeight - el.clientHeight;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + borderHeight}px`;
  }, [lookupInstruction]);
  // Flips the panel from the ask input over to the result view the moment a
  // question is sent — same 3D flip mechanic as the "prompt" CardType's own
  // PromptCardBody.tsx (front face = input, back face = rendered output).
  const [lookupFlipped, setLookupFlipped] = useState(false);
  const quotes = useQuotes();
  // "Ask AI" (Brilliantly Simple Generation Agent plan, scope: "cards") — replaces
  // the old read-only Quick Lookup stream entirely. No iteration history any more
  // (unlike the old lookup, this can create/edit/delete real Cards each time it
  // runs — browsing "past answers" doesn't make sense the same way once asking
  // again means a fresh round of real mutations, not just a new read-only reply);
  // one result at a time, cleared on every new ask.
  const agentLoop = useAgentLoop();
  const agentAskAbortRef = useRef<AbortController | null>(null);
  const [agentAskResultText, setAgentAskResultText] = useState<string | null>(null);
  const [agentAskNotice, setAgentAskNotice] = useState<string | null>(null);
  const [agentAskError, setAgentAskError] = useState<string | null>(null);
  const [agentAskStatus, setAgentAskStatus] = useState<string | null>(null);
  const lookupActive =
    selectedCards.length > 0 ||
    selectedEmbedIds.size > 0 ||
    quotes.length > 0 ||
    agentLoop.running ||
    agentAskResultText !== null ||
    agentAskNotice !== null ||
    !!agentAskError;
  // The moment the underlying selection (which Cards/embeds/Quotes) actually
  // changes, the whole panel resets — a different selection is a different topic.
  // Deliberately doesn't touch selectedCards/selectedEmbedIds/quotes themselves
  // (those changing is what triggers this, not something this responds by further
  // mutating) — only dismissLookup's own explicit close button does that
  // (clearQuotes). Skipped on mount (the ref starts equal to the first signature)
  // and whenever there's nothing yet to reset, so selecting the very first Card
  // doesn't do anything.
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
    if (agentAskResultText !== null || agentAskNotice !== null || agentAskError !== null || lookupInstruction !== "" || lookupFlipped) {
      agentAskAbortRef.current?.abort();
      setLookupInstruction("");
      setAgentAskResultText(null);
      setAgentAskNotice(null);
      setAgentAskError(null);
      setAgentAskStatus(null);
      setLookupFlipped(false);
    }
    // A different selection makes the old convert output/error stale the same way —
    // cleared here rather than left to linger until the panel's own Dismiss. Also
    // invalidates any markdown fetch/parse still in flight (convertRequestIdRef) so
    // it can't land a result for a selection that's no longer current.
    convertRequestIdRef.current++;
    if (convertOutput !== null || convertSections !== null || convertError !== null || convertLoading) {
      setConvertOutput(null);
      setConvertSections(null);
      setConvertError(null);
      setConvertLoading(false);
      setConvertMode(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionSignature]);
  /** "Convert" (selectedCards/quote rows) — an anchored popover positioned from its
   *  own trigger button's rect (computed at click time, same convention
   *  calloutPickerPos/calloutButtonRef below uses), picking which form to convert
   *  the current selection into. convertOutput/convertError
   *  hold the compiled result (or
   *  the file-Card error) once a target's actually been picked. Mostly a static
   *  panel, not a live generation — convertLoading is the one exception, true only
   *  while a selected markdown File Card's raw text is being fetched/parsed
   *  (markdownToWattleHtml.ts), the one genuinely async part of an otherwise
   *  synchronous compile. */
  const [convertPickerPos, setConvertPickerPos] = useState<{ left: number; bottom: number } | null>(null);
  const convertButtonRef = useRef<HTMLDivElement>(null);
  const [convertOutput, setConvertOutput] = useState<string | null>(null);
  /** "Split into Cards" (ConvertPicker's onPickDivide) own result — an EPUB's
   *  chapters or an HTML document's top-level heading sections, each already
   *  converted to Wattle HTML (plainTextToWattleHtml.ts). Mutually exclusive with
   *  convertOutput: only one of the two Convert flows is ever in flight/shown at
   *  once, distinguished by convertMode below. */
  const [convertSections, setConvertSections] = useState<{ title: string; html: string }[] | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  /** Which Convert flow convertLoading/convertError currently belong to — needed
   *  since handleConvertToStandardCard/handleConvertToDividedCards/
   *  handleConvertFileCard all share the same loading/error state but want
   *  different loading copy ("extract" reuses the generic "Converting…" text, no
   *  dedicated copy of its own — see the loading label's own ternary below). */
  const [convertMode, setConvertMode] = useState<"standard" | "divide" | "extract" | null>(null);
  /** True only while sequentially awaiting quickAddToPage/quickAddToDock across
   *  every divided section (handleAddDividedSectionsToPage/ToDock below) — guards
   *  against a second click mid-sequence firing a duplicate batch of N Cards, a
   *  much costlier accidental double-click than the single-card convert's own
   *  unguarded Add buttons risk. */
  const [bulkAdding, setBulkAdding] = useState(false);
  /** "Insert callout" — same anchored-popover convention as convertPickerPos
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
  /** The idle row's own "Upload file" action (uploadDockFileAction below) — same
   *  trigger-a-hidden-input pattern as vaultFileInputRef above, uploads straight
   *  into the Dock instead of the Vault. */
  const uploadDockFileInputRef = useRef<HTMLInputElement>(null);

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
  const formattingState = useEditorState({
    editor: activeEditor,
    selector: ({ editor }: { editor: Editor | null }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      // 0 = no heading active (a plain paragraph) — drives formatHeading's cycle
      // (paragraph -> H1 -> H2 -> … -> H6 -> paragraph) below.
      headingLevel:
        ([1, 2, 3, 4, 5, 6] as const).find((level) => editor?.isActive("heading", { level }) ?? false) ?? 0,
      codeBlock: editor?.isActive("codeBlock") ?? false,
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
    (convertOutput !== null || convertSections !== null || convertError !== null || convertLoading) &&
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
   *  tapping each one, or the row's own back-caret) alongside the current result.
   *  Aborts an in-flight agent run first, same as the back face's own explicit
   *  Stop. */
  function dismissLookup() {
    agentAskAbortRef.current?.abort();
    setLookupInstruction("");
    setAgentAskResultText(null);
    setAgentAskNotice(null);
    setAgentAskError(null);
    setAgentAskStatus(null);
    setLookupFlipped(false);
    clearQuotes();
  }

  /** The back face's own rail "Ask again"/edit button — same as PromptCardBody.tsx's
   *  rail edit button, just flips back to the front face to send another question.
   *  The current selection and whatever's typed in the instruction box stay exactly
   *  as they are — only the instruction text itself changes before sending again. */
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

  /** A file Card Convert can extract text from — a PDF, image, HTML document, or
   *  EPUB (fileExtractionService.ts's own supported kinds). */
  function isExtractableFileCard(card: Card): boolean {
    const file = card.metadata.file;
    if (!file) return false;
    return (
      isPdfFile(file.originalName, file.mimeType) ||
      isImageFile(file.originalName, file.mimeType) ||
      isHtmlFile(file.originalName, file.mimeType) ||
      isEpubFile(file.originalName, file.mimeType)
    );
  }

  /** True if any Card feeding the Convert action — a selected Page Card or a
   *  selected embed — is a File Card that Convert genuinely can't handle: not
   *  markdown (fetched/parsed via markdownToWattleHtml.ts) and not
   *  extractable (resolveConvertSourceHtml below extracts text from those on
   *  demand). A .zip, a .docx, etc. still have no HTML-shaped content to compile at
   *  all, so handleConvertToStandardCard below shows convertError for those. */
  function hasSelectedUnconvertibleFileCard(): boolean {
    const isUnconvertibleFile = (card: Card) =>
      getCardTypeId(card) === "file" && !markdownFileMeta(card) && !isExtractableFileCard(card);
    if (selectedCards.some((pc) => isUnconvertibleFile(resolveCanonicalCard(pc)))) return true;
    return [...selectedEmbedIds]
      .map((cardId) => getCachedCard(cardId))
      .filter((card): card is Card => !!card)
      .some(isUnconvertibleFile);
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

  /** One selected source's HTML for buildConvertHtml below. Markdown File Card ->
   *  fetch + convert (unchanged, fetchAndConvertMarkdownCard). A PDF/image/HTML/
   *  EPUB File Card -> extracted fresh every time (extractCardFileText is
   *  stateless — nothing is written back onto the source Card, see
   *  fileExtractionService.ts), then plainTextToWattleHtml'd into this new Card's
   *  content. Anything else -> `fallbackContent` (today's behavior, unchanged). */
  async function resolveConvertSourceHtml(card: Card, fallbackContent: string): Promise<string> {
    const markdown = markdownFileMeta(card);
    if (markdown) return fetchAndConvertMarkdownCard(card.id);
    if (isExtractableFileCard(card)) {
      const { text } = await extractCardFileText(card.id, { method: "auto" });
      return plainTextToWattleHtml(text);
    }
    return fallbackContent;
  }

  /** Compiles every selected Card's/embed's own HTML content plus every confirmed
   *  Quote (wrapped as its own blockquote) into one combined HTML blob — the new
   *  Standard Wattle Card's content when converting a multi-selection. Each source's
   *  own HTML comes from resolveConvertSourceHtml above; every other Card reads
   *  through the existing draft-aware/cache-fresh resolveCardContent. Keeps the real
   *  HTML rather than flattening to plain text (unlike useAgentLoop.ts's own context
   *  builder) — the whole point of "convert" is a real, editable Card at the end,
   *  not a text summary for a model prompt. Async because of the markdown
   *  fetch/on-demand extraction — every other source resolves synchronously, but
   *  Promise.all doesn't care either way. */
  async function buildConvertHtml(): Promise<string> {
    const cardHtmlPromises = selectedCards.map((pc) =>
      resolveConvertSourceHtml(resolveCanonicalCard(pc), resolveCardContent(pc)),
    );
    const embedHtmlPromises = [...selectedEmbedIds]
      .map((cardId) => getCachedCard(cardId))
      .filter((card): card is Card => !!card)
      .map((card) => resolveConvertSourceHtml(card, card.content));
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
    if (hasSelectedUnconvertibleFileCard()) {
      setConvertOutput(null);
      setConvertError(t("dock.convert.fileError"));
      return;
    }
    setConvertMode("standard");
    setConvertError(null);
    setConvertOutput(null);
    setConvertSections(null);
    const requestId = ++convertRequestIdRef.current;
    setConvertLoading(true);
    try {
      const html = await buildConvertHtml();
      if (convertRequestIdRef.current !== requestId) return;
      setConvertOutput(html);
    } catch (err) {
      if (convertRequestIdRef.current !== requestId) return;
      // Now that a File Card can trigger an on-demand extraction mid-convert
      // (resolveConvertSourceHtml), a failure here can be a page-limit/missing-
      // credential/model error, not just "couldn't read this markdown file" — show
      // whichever message is actually available.
      setConvertError(err instanceof Error ? err.message : t("dock.convert.markdownError"));
    } finally {
      if (convertRequestIdRef.current === requestId) setConvertLoading(false);
    }
  }

  /** The single selected/embedded Card driving any of the Convert menu's
   *  single-source-only options (OCR/Extract Text/AI Cleanup/Split into Cards) —
   *  null whenever the selection isn't exactly one Card (a multi-selection, an
   *  empty one, or one with a confirmed Quote alongside it): each of those options
   *  only has a sensible meaning for one document's own internal content, not a
   *  combined multi-selection the way the standard-card convert does. */
  function singleSelectedSourceCard(): Card | null {
    if (quotes.length > 0) return null;
    // A selected Dock Card takes precedence — mutually exclusive with
    // selectedCards/selectedEmbedIds by construction (App.tsx's toggleSelectDockCard
    // clears both), so this only ever fires on its own. toggleSelectDockCard only
    // ever selects one Dock Card at a time (replaces, not adds), so
    // `selectedDockCardIds` can never hold more than one id, regardless of how many
    // Cards the Dock itself holds.
    if (selectedDockCardIds.size > 0) {
      return dockCards.find((dc) => selectedDockCardIds.has(dc.id))?.card ?? null;
    }
    if (selectedCards.length + selectedEmbedIds.size !== 1) return null;
    return selectedCards.length === 1
      ? resolveCanonicalCard(selectedCards[0])
      : (getCachedCard([...selectedEmbedIds][0]) ?? null);
  }

  /** The single selected/embedded EPUB or HTML file Card "Split into Cards"
   *  (ConvertPicker's onPickDivide) would act on, or null otherwise. */
  function divideTarget(): Card | null {
    const card = singleSelectedSourceCard();
    const file = card?.metadata.file;
    if (!file) return null;
    return isEpubFile(file.originalName, file.mimeType) || isHtmlFile(file.originalName, file.mimeType)
      ? card
      : null;
  }

  /** The single selected/embedded extractable file Card (PDF/image/HTML/EPUB) the
   *  Convert menu's OCR/Extract Text/AI Cleanup options act on, or null otherwise —
   *  also what replaces "Standard Wattle Card" in the menu when non-null (see
   *  ConvertPicker's own onPickStandardCard doc comment). */
  function extractionTarget(): Card | null {
    const card = singleSelectedSourceCard();
    return card && isExtractableFileCard(card) ? card : null;
  }

  /** Of extractionTarget's own file, whether OCR is meaningful — a PDF or image
   *  only; an HTML/EPUB document has no image content to transcribe. */
  function ocrTarget(): Card | null {
    const card = extractionTarget();
    const file = card?.metadata.file;
    if (!file) return null;
    return isPdfFile(file.originalName, file.mimeType) || isImageFile(file.originalName, file.mimeType)
      ? card
      : null;
  }

  /** Of extractionTarget's own file, whether a text-layer/markup parse is
   *  meaningful — a PDF/HTML/EPUB only; a plain image has no text layer at all. */
  function rawExtractTarget(): Card | null {
    const card = extractionTarget();
    const file = card?.metadata.file;
    if (!file) return null;
    return isPdfFile(file.originalName, file.mimeType) ||
      isHtmlFile(file.originalName, file.mimeType) ||
      isEpubFile(file.originalName, file.mimeType)
      ? card
      : null;
  }

  /** "Split into Cards" (ConvertPicker's onPickDivide) — divideTarget's own chapters
   *  (EPUB) or top-level heading sections (HTML), each turned into its own Wattle
   *  HTML blob (plainTextToWattleHtml.ts) and shown as a plain title list rather
   *  than a full rendered preview per section (htmlEpubService.ts can return dozens
   *  of chapters for a whole book — rendering that many CardRichText instances at
   *  once isn't worth it just to preview something the next step immediately turns
   *  into real Cards anyway). Same convertLoading/convertRequestIdRef shape as
   *  handleConvertToStandardCard, distinguished by convertMode. */
  async function handleConvertToDividedCards() {
    setConvertPickerPos(null);
    const target = divideTarget();
    if (!target) {
      setConvertOutput(null);
      setConvertSections(null);
      setConvertError(t("dock.convert.fileError"));
      return;
    }
    setConvertMode("divide");
    setConvertError(null);
    setConvertOutput(null);
    setConvertSections(null);
    const requestId = ++convertRequestIdRef.current;
    setConvertLoading(true);
    try {
      const { sections } = await divideCardIntoSections(target.id);
      if (convertRequestIdRef.current !== requestId) return;
      if (sections.length === 0) {
        setConvertError(t("dock.convert.divideEmpty"));
      } else {
        setConvertSections(sections.map((s) => ({ title: s.title, html: plainTextToWattleHtml(s.text) })));
      }
    } catch (err) {
      if (convertRequestIdRef.current !== requestId) return;
      setConvertError(err instanceof Error ? err.message : t("dock.convert.markdownError"));
    } finally {
      if (convertRequestIdRef.current === requestId) setConvertLoading(false);
    }
  }

  /** The Convert menu's OCR/Extract Text/AI Cleanup options (ConvertPicker's
   *  onPickOcr/onPickExtractText/onPickAiCleanup) — unlike every other Convert
   *  flow, this never shows a preview: it extracts, then immediately creates the
   *  result straight in the Dock (onConvertedCardToDock, same land-on-the-new-Card
   *  behavior App.tsx's handleUploadFileToDock already gives an uploaded file) and
   *  dismisses, regardless of whether the source itself is a Page Card or a Dock
   *  Card (singleSelectedSourceCard/extractionTarget resolve either the same way,
   *  and the Dock holds as many Cards as added, so there's no "already occupied"
   *  case to route around any more). convertLoading/convertError still cover the
   *  wait/failure — a multi-page OCR or an AI Cleanup pass can take tens of
   *  seconds — there's just no separate "here's your result, click Add" step in
   *  between success and the Card actually landing. The new Card's title comes
   *  from the source File Card's own title (falling back to its original
   *  filename), not left blank. */
  async function handleConvertFileCard(method: "ocr" | "textLayer" | "aiCleanup") {
    setConvertPickerPos(null);
    const target = extractionTarget();
    if (!target) {
      setConvertOutput(null);
      setConvertSections(null);
      setConvertError(t("dock.convert.fileError"));
      return;
    }
    setConvertMode("extract");
    setConvertError(null);
    setConvertOutput(null);
    setConvertSections(null);
    const requestId = ++convertRequestIdRef.current;
    setConvertLoading(true);
    try {
      const { text } = await extractCardFileText(target.id, { method });
      if (convertRequestIdRef.current !== requestId) return;
      const title = target.title || target.metadata.file?.originalName || "";
      await onConvertedCardToDock(title, plainTextToWattleHtml(text));
      if (convertRequestIdRef.current !== requestId) return;
      dismissConvertOutput();
    } catch (err) {
      if (convertRequestIdRef.current !== requestId) return;
      setConvertError(err instanceof Error ? err.message : t("dock.convert.markdownError"));
    } finally {
      if (convertRequestIdRef.current === requestId) setConvertLoading(false);
    }
  }

  /** Adds every divided section as its own Card, awaited in sequence (not fired all
   *  at once) so they land on the Page/Dock in the same order they appear in the
   *  book/document — then dismisses the panel, unlike the single-card convert's own
   *  Add buttons (which leave the panel open): a stray second click here would
   *  create a whole duplicate batch of N Cards, not just one, so removing the
   *  now-already-added sections from view is worth the small behavioral asymmetry. */
  async function handleAddDividedSectionsToPage() {
    if (!convertSections || bulkAdding) return;
    setBulkAdding(true);
    try {
      for (const section of convertSections) await quickAddToPage(section.html, section.title);
      dismissConvertOutput();
    } finally {
      setBulkAdding(false);
    }
  }

  async function handleAddDividedSectionsToDock() {
    if (!convertSections || bulkAdding) return;
    setBulkAdding(true);
    try {
      for (const section of convertSections) await quickAddToDock(section.html, section.title);
      dismissConvertOutput();
    } finally {
      setBulkAdding(false);
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
    setConvertSections(null);
    setConvertError(null);
    setConvertLoading(false);
    setConvertMode(null);
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
  // Embeds count toward "cards" too — see the summary readout below.
  const lookupCardCount = selectedCards.length + selectedEmbedIds.size;

  /** "Ask AI" (Brilliantly Simple Generation Agent plan) — runs the tool-calling
   *  agent scoped to `selectedCards` (scope: "cards"), rather than the old
   *  read-only lookup stream. Requires at least one top-level Card selected (the
   *  agent's tools address Cards by pageCardId/cardId — a bare Quote or an embed
   *  alone has nothing addressable for it to mutate); the send button below is
   *  disabled otherwise. Any mutation the agent makes lands as real, immediate
   *  edits to the Page itself (via the same runActionJob path every other action
   *  in this app uses) — the result text shown on the back face is just the
   *  model's own closing status line, not something that itself needs adding
   *  anywhere. */
  async function handleAskAgent() {
    if (!currentPage || selectedCards.length === 0 || agentLoop.running) return;
    const instructionAtSend = lookupInstruction;
    setAgentAskResultText(null);
    setAgentAskNotice(null);
    setAgentAskError(null);
    setAgentAskStatus(null);
    setLookupFlipped(true);
    const controller = new AbortController();
    agentAskAbortRef.current = controller;
    try {
      const outcome = await agentLoop.runAgent({
        scope: "cards",
        instruction: instructionAtSend,
        page: currentPage,
        selectedCards,
        onRunActionJob,
        onProgress: (event) => {
          if (event.toolNames.length > 0) setAgentAskStatus(`${t("generate.agentRunning")} ${event.toolNames.join(", ")}…`);
        },
        signal: controller.signal,
      });
      if (outcome.status === "done") setAgentAskResultText(outcome.text || t("quickLookup.done"));
      else if (outcome.status === "max_rounds") setAgentAskNotice(t("generate.autoRunChainCapped"));
      else if (outcome.status === "paused_for_input") setAgentAskNotice(t("generate.agentPausedForInput"));
    } catch (err) {
      setAgentAskError(err instanceof Error ? err.message : "Agent run failed");
    } finally {
      agentAskAbortRef.current = null;
    }
  }

  /** Shared by both the `selected` and `selectedEmbedId` branches below — a Card and
   *  an embedded Card get the same accept-all-diffs action, same precedent as their
   *  existing Edit/Move/Remove set. The annotate/process trigger that used to live
   *  here (Card design pass) was cut from both rows — still reachable, when there's
   *  something to accept, via acceptAllDiffs below. */
  const processActions: DockAction[] = [
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

  // Move Mode's own "drop onto the Dock" destination for whatever's in transit —
  // the Dock renders its own Card list inline now, no toggle/panel to open at all,
  // so this used to be one of dockCardsAction's four repurposed meanings; that
  // toggle is gone, these two stay as their own small, dedicated actions instead
  // (see the `actions` ternary below, which includes the right one alongside
  // Cancel only for the matching move state — a Dock Card mid-Move has nowhere to
  // "move to Dock" *from*, since it's already there).
  const moveToDockAction: DockAction = {
    key: "moveToDock",
    operationId: null,
    icon: "tray",
    label: t("dock.action.moveToDock"),
    onClick: onMoveToDock,
  };
  const moveEmbedToDockAction: DockAction = {
    key: "moveEmbedToDock",
    operationId: null,
    icon: "tray",
    label: t("dock.action.moveToDock"),
    onClick: onMoveEmbedToDock,
  };

  // One tap straight into the Dock as a new Dock Card — shortcuts the Dock Cards
  // panel's own creation flow (open panel -> "+" -> ellipsis -> File tile), same
  // reasoning the Vault row's own Upload action already gets its own button rather
  // than being buried in a menu.
  const uploadDockFileAction: DockAction = {
    key: "uploadDockFile",
    operationId: null,
    icon: "upload",
    label: t("dock.action.uploadFile"),
    onClick: () => uploadDockFileInputRef.current?.click(),
  };

  // The idle Dock row's fixed left-to-right set (feedback: "Redo... home, search,
  // dock, undo/redo, vertical ellipses"). More stays a placeholder — Home opens the
  // full-page Homes view (App.tsx's own fullscreen-overlay pattern, not this Dock's
  // slide-up drawer system): every structural Home in the system, pick one or make
  // a new one. Undo/Redo (and versionBack/versionForward, added alongside them) are
  // the full state system — App.tsx's useHistory, auto-scoped to whatever's
  // currently selected (empty selection = the whole Page).
  const homeAction: DockAction = {
    key: "home",
    operationId: null,
    icon: "home",
    label: t("dock.homes.open"),
    onClick: onOpenHomesPage,
  };
  const undoAction: DockAction = {
    key: "undo",
    operationId: null,
    icon: "undo",
    label: t("dock.action.undo"),
    onClick: onUndo,
    disabled: !canUndo,
  };
  const redoAction: DockAction = {
    key: "redo",
    operationId: null,
    icon: "redo",
    label: t("dock.action.redo"),
    onClick: onRedo,
    disabled: !canRedo,
  };
  const versionBackAction: DockAction = {
    key: "versionBack",
    operationId: null,
    icon: "versionBack",
    label: t("dock.action.versionBack"),
    onClick: onVersionBack,
    disabled: !canVersionBack,
  };
  const versionForwardAction: DockAction = {
    key: "versionForward",
    operationId: null,
    icon: "versionForward",
    label: t("dock.action.versionForward"),
    onClick: onVersionForward,
    disabled: !canVersionForward,
  };
  const moreAction: DockAction = {
    key: "more",
    operationId: null,
    icon: "moreVertical",
    label: t("dock.action.more"),
    onClick: () => {},
  };

  const vaultViewContent = renderedPanel === "vault" && (
    <div className="dock__extended-panel-view">
      <VaultView
        query={vaultQuery}
        onQueryChange={onVaultQueryChange}
        searchResults={vaultSearchResults}
        pageResults={vaultPageResults}
        onOpenPage={onOpenPageFromSearch}
        homes={vaultHomes}
        onCreateHome={onCreateHome}
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
    // Same option set a selected top-level Card gets (Freeze/Move/Hide/Convert +
    // processActions below), plus one embed-only extra: "Add to page". Remove/
    // Delete dropped from this row — CardEmbed.tsx's own header now has a real
    // close ("X", CardHeaderActions) covering detach the same way a top-level
    // Card's own header X does, so a second Remove here would be redundant; full
    // vault deletion isn't offered to a selected top-level Card either (only the
    // Vault panel does that), so an embed doesn't get it here now either.
    const embedCard = selectedEmbedCard;
    const embedAvailable = embedCard ? supportedOperationIds(getCardTypeId(embedCard)) : new Set<string>();
    const embedHidden = embedCard?.metadata.hidden ?? false;
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
      {
        key: "addEmbedToPage",
        operationId: null,
        icon: "pages" as const,
        label: t("dock.action.addToPage"),
        onClick: onAddEmbedToPage,
      },
      // Freeze — only offered once it's savedToVault and not already Frozen, same
      // gating as a selected top-level Card's own Freeze (an embed never has a
      // pending draft to also check — "no page-local draft for an embed").
      ...(embedCard && embedCard.savedToVault && !embedCard.frozenAt
        ? [
            {
              key: "freezeEmbed",
              operationId: "card.freeze",
              icon: "lock" as const,
              label: t("dock.action.freeze"),
              onClick: onFreezeEmbed,
            },
          ]
        : []),
      {
        key: "toggleHiddenEmbed",
        operationId: null,
        icon: embedHidden ? ("eye" as const) : ("eyeOff" as const),
        label: embedHidden ? t("dock.action.show") : t("dock.action.hide"),
        onClick: onToggleHiddenEmbed,
      },
      {
        key: "convertEmbed",
        operationId: null,
        icon: "convert" as const,
        label: t("dock.action.convert"),
        onClick: toggleConvertPicker,
      },
      // No separate Move to Dock: dropping onto the Dock is now one of Move's own
      // destinations — tap the Dock Cards toggle itself while moving (see
      // dockCardsAction below).
      ...processActions,
    ].filter((action) => action.operationId === null || embedAvailable.has(action.operationId));
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
    // Whether the Hide action should read "Show" instead — true only once every
    // selected Card is already hidden, same "every, not some" bulk-toggle
    // convention a "select all" checkbox uses; a mixed selection (some hidden,
    // some not) defaults back to "Hide", which then hides the rest too.
    const allSelectedHidden = selectedCards.every((pc) => pc.card.metadata.hidden);
    modeActions = [
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
      // rather than firing an action directly. Icon.tsx's own "convert" glyph
      // (Card design pass) is an arrow feeding into a document now, not the
      // original circular-arrows/sync symbol it used to be — reads directly as
      // "compile this selection into a Standard Wattle Card".
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
      // StackBody.tsx/FileView.tsx) rather than the Dock. Bulk remove is gone too
      // (Card design pass) — each Card's own header "X" covers it one at a time now.
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
      // Same ConvertPicker as every other selection row's own Convert —
      // singleSelectedSourceCard() above resolves straight to this selected Dock
      // Card, so OCR/Extract Text/AI Cleanup/Split into Cards all work here too when
      // it's an extractable file; "Standard Wattle Card" itself stays hidden for a
      // Dock Card selection (see onPickStandardCard below) since compiling a single
      // Card into "a new Standard Wattle Card" is meaningless outside a multi-source
      // combine.
      {
        key: "convertDockCard",
        operationId: null,
        icon: "convert" as const,
        label: t("dock.action.convert"),
        onClick: toggleConvertPicker,
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
      // Opens the same ConvertPicker as the selectedCards row's own Convert — same
      // "convert" icon as there.
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
    // Bullet/numbered lists, blockquote, and horizontal rule have no toolbar
    // button any more — StarterKit's own input rules already turn "- "/"1. "/
    // "> "/"---" typed at a line start into the real thing, and that's the only
    // way to reach them now (this toolbar's fixed vocabulary: bold/italic/
    // heading, table/code block/image/callout/math, new card/new page).
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
      key: "insertTable",
      operationId: null,
      icon: "table" as const,
      label: t("card.insertTable"),
      onClick: () => activeEditor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      active: formattingState?.insideTable ?? false,
      disabled: !activeEditor,
    },
    // Row/column/table editing — only reachable while the cursor already sits
    // inside a table, rather than five more permanently-shown buttons: a fixed 3x3
    // insert has no other way to grow, shrink, or remove itself afterward
    // otherwise (base @tiptap/extension-table ships no grip/menu UI of its own).
    ...(formattingState?.insideTable
      ? [
          {
            key: "tableInsertRow",
            operationId: null,
            icon: "tableInsertRow" as const,
            label: t("card.insertRowAfter"),
            onClick: () => activeEditor?.chain().focus().addRowAfter().run(),
            disabled: !activeEditor,
          },
          {
            key: "tableInsertColumn",
            operationId: null,
            icon: "tableInsertColumn" as const,
            label: t("card.insertColumnAfter"),
            onClick: () => activeEditor?.chain().focus().addColumnAfter().run(),
            disabled: !activeEditor,
          },
          {
            key: "tableDeleteRow",
            operationId: null,
            icon: "delete" as const,
            label: t("card.deleteRow"),
            onClick: () => activeEditor?.chain().focus().deleteRow().run(),
            disabled: !activeEditor,
            danger: true,
          },
          {
            key: "tableDeleteColumn",
            operationId: null,
            icon: "delete" as const,
            label: t("card.deleteColumn"),
            onClick: () => activeEditor?.chain().focus().deleteColumn().run(),
            disabled: !activeEditor,
            danger: true,
          },
          {
            key: "tableDelete",
            operationId: null,
            icon: "delete" as const,
            label: t("card.deleteTable"),
            onClick: () => activeEditor?.chain().focus().deleteTable().run(),
            disabled: !activeEditor,
            danger: true,
          },
        ]
      : []),
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
    // "New card"/"New page" (replacing the old "link to an existing card/page"
    // pickers) — create-and-insert in one click, no picker: a brand-new blank
    // vault Card embedded at the cursor, or a brand-new blank Page linked at the
    // cursor. Linking to something that already exists is still reachable the
    // normal way (Open from Vault — FeedInputButton.tsx/the Vault panel), just
    // not from this toolbar any more.
    {
      key: "insertNewCard",
      operationId: null,
      icon: "plus" as const,
      label: t("dock.action.newCard"),
      onClick: async () => {
        if (!activeEditor) return;
        const card = await createCard({ title: "", content: "" });
        activeEditor.chain().focus().insertContent({ type: "cardEmbed", attrs: { cardId: card.id } }).run();
      },
      disabled: !activeEditor,
    },
    {
      key: "insertNewPage",
      operationId: null,
      icon: "pages" as const,
      label: t("dock.action.newPage"),
      onClick: async () => {
        if (!activeEditor) return;
        const page = await createPage();
        activeEditor
          .chain()
          .focus()
          .insertContent({ type: "pageLink", attrs: { pageId: page.id, title: page.title ?? "" } })
          .run();
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
  // drop target (PageStack.tsx) or back out. Page Card/embed Move also keeps its
  // own "drop onto the Dock" destination in the row alongside Cancel (see
  // moveToDockAction/moveEmbedToDockAction above); a Dock Card mid-Move has
  // nowhere to drop back onto the Dock, so dockCardMoving doesn't get one.
  const actions: DockAction[] = moving
    ? [
        {
          key: "cancelMove",
          operationId: null,
          icon: "close" as const,
          label: t("dock.action.cancelMove"),
          onClick: onCancelMove,
        },
        moveToDockAction,
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
            moveEmbedToDockAction,
          ]
        : embedOrPageCardSelected
          ? (vaultModeActions ?? modeActions)
          : isEditingActive
            ? formattingActions
            : [
                homeAction,
                vaultAction,
                uploadDockFileAction,
                undoAction,
                redoAction,
                versionBackAction,
                versionForwardAction,
                moreAction,
                ...(vaultModeActions ?? modeActions),
                // Tucked in last, not pinned first — a real, working toggle, but low
                // priority next to Home/Search/Dock (feedback: "doesn't need to look
                // different... not that high priority"). Plain row button now, same
                // as everything else here, instead of a fixed sibling of .dock__row.
                revealHiddenAction,
              ];

  // vaultAction only ever lives in the true idle row above — every other row
  // (selectedCards/dock-card/quotes/moving/formatting) has its own, unrelated set
  // of actions with no toggle to fold Vault back down. Same "always foldable, no
  // matter what's selected" reasoning as the page-nav cluster's own fix above:
  // whenever Vault is left open, its own close-icon toggle gets folded into
  // whichever row is currently showing (the `.some` guard just skips this on the
  // idle row itself, where it's already present).
  const rowActions: DockAction[] =
    vaultOpen && !actions.some((a) => a.key === "vault") ? [...actions, vaultAction] : actions;

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

  // Pages/Vault are short-to-medium lists — cap them noticeably smaller than
  // Dock Cards (which can hold a lot more), so they don't take up more space than
  // they need. Vault joins them now that its own toolbar moved down into this row
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
      {pagesViewContent}
    </div>
  );

  return (
    <footer
      className="dock"
      // Prevents any Dock button from taking focus on click — same technique
      // format/insert buttons already used individually for a different reason
      // (not stealing focus from the ProseMirror editor), generalized here to
      // every button in the Dock: a focused button inside .dock__row's own
      // `overflow-x: auto` (or any other scrolling ancestor) can trigger the
      // browser's default "scroll the focused element into view" behavior,
      // which reads as the row randomly jumping/scrolling on an ordinary tap.
      // Delegated once here rather than on every individual button — mousedown's
      // preventDefault only suppresses the focus (and thus that scroll), the
      // click itself (and so every button's own onClick) still fires normally.
      // Scoped to actual <button> elements via closest() so text inputs
      // elsewhere in the Dock (Quick Lookup's own textarea, Vault search, rename
      // fields) still focus normally on click.
      onMouseDown={(e) => {
        if ((e.target as Element).closest("button")) e.preventDefault();
      }}
    >
      {/* Everything above the button row (extended Vault/Pages panel, the Dock's own
          Card slot, notices/errors, the quick-lookup/convert panel) shares one
          scrollable region capped at half the viewport — the whole point being
          "the Dock never covers more than half the screen," not just whichever one
          of these happens to be showing. Each of these already caps its own height
          more tightly on its own (extendedPanel's 30vh/20vh, .dock__card-slot's own
          50vh on its Card content below) — this outer cap is the backstop for when
          more than one is open/tall at once (e.g. Vault open *and* the Dock's own
          Card unfolded to a long PDF extraction), so their combined height still
          can't push .dock__bottom-row's own buttons off-screen. */}
      <div className="dock__scroll-area">
      {extendedPanel}
      {/* The Dock's own carousel — as many Cards as have been added, but only one
          shown at a time (DockCardRail's subtle side arrows browse between them),
          the right arrow turning into a quiet "+" once you're at the end — creates
          a new, blank Dock Card and lands straight on it (currentDockCardId's own
          reconciling effect above: the newest Card is always last, since every
          creation path appends). That blank Card's own body is a Feed Input
          Button in *place* of its normal content (DockCardView's own isBlank
          check) — Generate (dockCardGenerating/etc. below, App.tsx's own Dock-
          scoped useGeneration instance) or typed Add, same as a blank Page/Stack
          alternate gets — so the Feed Input Button only ever shows once a new
          Dock Card has actually been opened, never as a standing extra tile. */}
      <DockCardRail
        index={currentDockCardIndex}
        total={dockCards.length}
        atStart={currentDockCardIndex <= 0}
        atEnd={dockCardAtEnd}
        onPrevious={() => {
          if (currentDockCardIndex > 0) setCurrentDockCardId(dockCards[currentDockCardIndex - 1].id);
        }}
        onNext={() => {
          if (currentDockCardIndex >= 0 && currentDockCardIndex < dockCards.length - 1) {
            setCurrentDockCardId(dockCards[currentDockCardIndex + 1].id);
          }
        }}
        onAdd={() => {
          void onCreateDockCard("", "");
        }}
        disabled={dockCardGenerating}
      >
        {currentDockCard && (
          <div className="dock__card-slot">
            <DockCardView
              dockCard={currentDockCard}
              selected={selectedDockCardIds.has(currentDockCard.id)}
              onSelect={() => onToggleSelectDockCard(currentDockCard.id)}
              onSendToPage={() => onSendDockCardToPage(currentDockCard.id)}
              onClose={() => onCloseDockCard(currentDockCard.id)}
              onTurnIntoStack={() => onTurnDockCardIntoStack(currentDockCard.id)}
              editingEmbedIds={editingDockCardIds}
              onToggleEmbedEdit={onToggleDockCardEdit}
              generating={dockCardGenerating}
              generationNodes={dockCardGenerationNodes}
              generationRootId={dockCardGenerationRootId}
              onGenerate={(instruction) => onGenerateDockCard(currentDockCard.id, instruction)}
              onStopGeneration={onStopDockCardGeneration}
            />
          </div>
        )}
      </DockCardRail>
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
              agent's own run (Brilliantly Simple Generation Agent plan, scope:
              "cards"), flipping over the moment a question is sent
              (handleAskAgent). Any mutation the agent makes lands as real edits to
              the Page itself, not just to what's shown here — the back face is a
              status readout, not a review step. */}
          <div className={`dock__lookup-flip${lookupFlipped ? " dock__lookup-flip--flipped" : ""}`}>
            <div
              className={`dock__lookup-face dock__lookup-face--front${lookupFlipped ? " dock__lookup-face--hidden" : ""}`}
            >
              {/* Just a text box with its own send icon embedded in it now (Card
                  design pass) — no placeholder, no separate close button;
                  Escape (below) still dismisses, and deselecting the underlying
                  Card/embed/Quote makes the whole panel disappear on its own
                  (lookupActive above). */}
              <div className="dock__lookup-ask">
                <InputField
                  multiline
                  rows={1}
                  ref={lookupInputRef}
                  className="dock__lookup-input"
                  value={lookupInstruction}
                  onChange={(e) => setLookupInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") dismissLookup();
                    else if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleAskAgent();
                    }
                  }}
                />
                <Button
                  iconOnly
                  className="dock__lookup-send"
                  onClick={() => void handleAskAgent()}
                  disabled={agentLoop.running || selectedCards.length === 0}
                  aria-label={t("quickLookup.ask")}
                  title={selectedCards.length === 0 ? t("quickLookup.needsCardSelected") : t("quickLookup.ask")}
                >
                  <Icon name="generate" spin={agentLoop.running} />
                </Button>
              </div>
            </div>
            <div
              className={`dock__lookup-face dock__lookup-face--back${lookupFlipped ? "" : " dock__lookup-face--hidden"}`}
            >
              {/* Same small rail as PromptCardBody.tsx's own — the edit button
                  flips back to the front face to ask another question. No prev/
                  next any more (unlike the old read-only lookup): each ask is a
                  fresh round of real mutations, not one more answer to browse
                  back to. */}
              <div className="dock__lookup-rail">
                <Button
                  iconOnly
                  onClick={handleAskAgain}
                  aria-label={t("quickLookup.askAgain")}
                  title={t("quickLookup.askAgain")}
                >
                  <Icon name="edit" />
                </Button>
              </div>
              {agentLoop.running ? (
                <div className="dock__lookup-generating">
                  <Icon name="generate" spin />
                  <span>{agentAskStatus ?? t("promptCard.sending")}</span>
                  <Button onClick={() => agentAskAbortRef.current?.abort()}>
                    <Icon name="stop" />
                    {t("promptCard.stop")}
                  </Button>
                </div>
              ) : agentAskResultText !== null || agentAskNotice !== null ? (
                <>
                  <div className="dock__lookup-result-card">
                    <p>{agentAskResultText ?? agentAskNotice}</p>
                  </div>
                  <div className="dock__lookup-actions">
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
          {agentAskError && <p className="dock__lookup-error">{agentAskError}</p>}
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
                <span>{convertMode === "divide" ? t("dock.convert.dividing") : t("dock.convert.converting")}</span>
              </div>
            ) : convertError ? (
              <p className="dock__lookup-error">{convertError}</p>
            ) : convertSections ? (
              // A plain title list, not a full rendered preview per section — see
              // handleConvertToDividedCards' own doc comment on why (a whole book's
              // worth of CardRichText instances isn't worth mounting just to preview
              // something the next click immediately turns into real Cards anyway).
              <div className="dock__lookup-result-card dock__convert-sections">
                <p className="dock__convert-sections-summary">
                  {convertSections.length} {t("dock.convert.divideSummaryPrefix")}
                </p>
                <ol className="dock__convert-sections-list">
                  {convertSections.map((section, i) => (
                    <li key={i}>{section.title}</li>
                  ))}
                </ol>
              </div>
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
              {!convertLoading && !convertError && convertSections && (
                <>
                  <Button disabled={bulkAdding} onClick={handleAddDividedSectionsToPage}>
                    <Icon name="plus" />
                    {bulkAdding ? t("dock.convert.addingSections") : t("quickLookup.addToPage")}
                  </Button>
                  <Button disabled={bulkAdding} onClick={handleAddDividedSectionsToDock}>
                    <Icon name="tray" />
                    {bulkAdding ? t("dock.convert.addingSections") : t("quickLookup.addToDock")}
                  </Button>
                </>
              )}
              {!convertLoading && !convertError && !convertSections && (
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
      </div>
      <div className="dock__bottom-row">
        <div className="dock__row">
          {rowActions.map((action, index) => {
            // Vault-specific actions (New Card/Upload with nothing selected;
            // Add to Page/Rename/Delete once a Card in the vault is selected —
            // vaultModeActions above) get a visibly different treatment and a
            // divider ahead of the first one, so they read as their own cluster
            // rather than blending into the row's other actions — the
            // exact toggle button itself (key "vault") is excluded, since that one
            // belongs with dockCardsAction as a plain panel toggle, not
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
            action.key === "convert" || action.key === "convertQuotes" || action.key === "convertDockCard" ? (
              // "convert" opens ConvertPicker anchored to its own button, rather
              // than firing an action directly — needs its own positioned wrapper,
              // unlike every other plain-click DockAction below. One shared ref,
              // since only one of "convert"/"convertQuotes"/"convertDockCard" is
              // ever present in a given row's actions at once (selectedCards vs.
              // the quotes-only row vs. the selected-Dock-Card row), so there's no
              // risk of two DOM nodes fighting over it.
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
            })}
        </div>
        {/* "12 words, 2 cards, 1 quote" — pinned to the bottom-right corner of the
            Dock, same slot family as .dock__page-nav just below (the two are
            near-complementary: this shows exactly while something's selected for
            Quick Lookup, the page nav hides then). Was inline inside the ask
            panel itself; moved here so that panel stays just a text box and a
            magic icon (Card design pass). */}
        {(selectedCards.length > 0 || selectedEmbedIds.size > 0 || quotes.length > 0) && (
          <div className="dock__selection-summary">
            {lookupWordCount} word{lookupWordCount === 1 ? "" : "s"}, {lookupCardCount} card
            {lookupCardCount === 1 ? "" : "s"}, {quotes.length} quote{quotes.length === 1 ? "" : "s"}
          </div>
        )}
        {/* The Page nav cluster (formerly the standalone PageNav component, merged
            here per feedback) — up/down (the optional sibling trail, Phase 3) /add,
            Home, pin, and the Pages panel toggle, pinned to the bottom-right corner
            of the Dock. (The hidden-Cards reveal toggle used to live here too — it's
            its own standalone button now, revealHiddenAction above, visible on the
            idle screen too rather than gated with this cluster.) Hidden on the true
            idle screen (`openPanel === null`) — the idle row's own Home stub covers
            that slot there; this fuller cluster (back/forward/pin/Pages toggle/add)
            reappears once Vault/Pages is open. Once a panel *is* open, though, it
            has to stay reachable no matter what else gets selected afterward — a
            Page Card/embed selected while Pages is open used to hide this whole
            cluster (the old "Selection Lock," Step 6 spec §4.3), which meant the
            Pages toggle itself — the only way to fold that panel back down — went
            away with it, leaving the panel stuck open until the selection was
            cleared some other way. Selection no longer gates this at all now: the
            Pages toggle (and everything else here) stays foldable in every state,
            same as vaultAction below now getting folded into every row (see
            rowActions) whenever Vault is the one left open. */}
        {(openPanel !== null || moving || dockCardMoving) && (
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
      {convertPickerPos && (
        <ConvertPicker
          style={{ left: convertPickerPos.left, bottom: convertPickerPos.bottom }}
          onPickStandardCard={
            extractionTarget() || selectedDockCardIds.size > 0 ? null : handleConvertToStandardCard
          }
          onPickOcr={ocrTarget() ? () => handleConvertFileCard("ocr") : null}
          onPickExtractText={rawExtractTarget() ? () => handleConvertFileCard("textLayer") : null}
          onPickAiCleanup={extractionTarget() ? () => handleConvertFileCard("aiCleanup") : null}
          onPickDivide={divideTarget() ? handleConvertToDividedCards : null}
          onClose={() => setConvertPickerPos(null)}
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
      {/* Hidden native file input backing the idle row's "Upload file" action — see
          uploadDockFileInputRef above. */}
      <input
        ref={uploadDockFileInputRef}
        type="file"
        className="dock__hidden-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onUploadFileToDock(file);
        }}
      />
    </footer>
  );
}

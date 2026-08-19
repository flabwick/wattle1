import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  Template,
  Card,
  GenerateResponse,
  PageCardSnapshot,
  PageCardWithCard,
  PageSummary,
  PageWithCards,
} from "@wattle/shared";
import type { AnnotationProcess } from "./api/client.js";
import { Dock } from "./components/Dock/Dock.js";
import { Icon } from "./components/primitives/index.js";
import type { DockPanel } from "./components/Dock/Dock.js";
import { HomesPanel } from "./components/Dock/HomesPanel.js";
import { PageStack } from "./components/PageStack/PageStack.js";
import { PageStackEdges } from "./components/PageStack/PageStackEdges.js";
import { SaveAsTemplateModal } from "./components/Templates/SaveAsTemplateModal.js";
import { TemplateBrowser } from "./components/Templates/TemplateBrowser.js";
import * as api from "./api/client.js";
import { usePage } from "./hooks/usePage.js";
import { useSiblingPages } from "./hooks/useSiblingPages.js";
import { usePageAncestors } from "./hooks/usePageAncestors.js";
import { usePagesNav } from "./hooks/usePagesNav.js";
import { useVault } from "./hooks/useVault.js";
import { useDockCards } from "./hooks/useDockCards.js";
import { useGeneration } from "./hooks/useGeneration.js";
import { useAgentLoop } from "./hooks/useAgentLoop.js";
import { useAnnotations } from "./hooks/useAnnotations.js";
import { snapshotForCards, snapshotWholePage, useHistory } from "./hooks/useHistory.js";
import { editCard, getCachedCard, notifySaved, subscribeToCard } from "./lib/cardStore.js";
import { registerQuickAddHandlers } from "./lib/quickAddRegistry.js";
import { registerPageNavHandler } from "./lib/pageNavRegistry.js";
import { getCardTypeId } from "./lib/getCardTypeId.js";
import { runActionJob, type StepOutput } from "./lib/actionJobs.js";
import { materializeGeneratedInputCard } from "./lib/generatedInputCard.js";
import { t } from "./i18n/index.js";

/** Move Mode never applies inside the fullscreen single-Card view (App.tsx's
 *  focusedPageCardId) — shared, stable references so that <PageStack>'s "not
 *  moving" props there don't churn on every render. */
const EMPTY_ID_SET: ReadonlySet<string> = new Set();
const NOOP_INDEX = (_index: number) => {};
/** The fullscreen single-Card view has no breadcrumb (no onRenameTitle either — see
 *  PageBreadcrumb's own doc comment), so <PageStack>'s ancestors prop there is
 *  always empty — same "stable reference" reasoning as EMPTY_ID_SET above. */
const EMPTY_PAGE_SUMMARIES: PageSummary[] = [];
const NOOP_ID = (_id: string) => {};

export function App() {
  /** Every currently-selected top-level Card on the current Page — multiple Cards
   *  can be selected at once (toggleSelectPageCard adds rather than replaces);
   *  tapping an already-selected Card's body is a no-op, its own header's edit/
   *  deselect icons act on it instead. Dock actions (Save/Move/Hide/remove/the
   *  prompt panel's context) all operate over the whole set. Selection Lock (§4.3)
   *  keeps Page/Tab navigation disabled the whole time this is non-empty, so every
   *  id in it is guaranteed to belong to `currentPage` — nothing can navigate out
   *  from under it. */
  const [selectedPageCardIds, setSelectedPageCardIds] = useState<Set<string>>(new Set());
  /** Which Page fills the screen right now (Step 7: Pages are full-screen, navigated
   *  with the up/down arrows, one visible at a time — not a click-to-select thing). */
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  /** Which top-level Card is in its own inline edit mode — independent of
   *  `selectedPageCardIds` now (Card Feed Interaction plan): a Card can be the
   *  active editor without being selected at all, and rail-selecting/deselecting a
   *  Card never touches this. At most one entry at a time for a note Card
   *  (activatePageCardEditor always replaces rather than adds), though a non-note
   *  CardType reached via the Dock's own Edit action still lands here too — see
   *  isEditingActive's own doc comment for why only "note" ones drive the
   *  formatting toolbar. */
  const [editingPageCardIds, setEditingPageCardIds] = useState<Set<string>>(new Set());
  /** The one Card currently open full-screen (a Card's own "expand" corner button —
   *  see Card.tsx/StackBody.tsx), or null the rest of the time. Independent of
   *  selection/editing: entering/leaving this doesn't touch either. Cleared
   *  automatically below if the Card it points at stops being on the current Page
   *  (removed, or the Page itself changed out from under it). */
  const [focusedPageCardId, setFocusedPageCardId] = useState<string | null>(null);
  /** The Homes view (Dock's own idle-row Home button) — every structural Home in
   *  the system, pick one to jump to or make a new one. A full page in its own
   *  right (not a quick drawer), so it mirrors focusedPageCardId's own fullscreen
   *  overlay pattern below rather than the Dock's slide-up panel system. */
  const [homesPageOpen, setHomesPageOpen] = useState(false);
  /** Every independently-selected embedded Card (CardRichText.tsx/CardEmbed.tsx's
   *  click-to-select), keyed by cardId — several can be selected at once now,
   *  alongside `selectedPageCardIds` and Quotes, all feeding the Dock's combined
   *  "many selections" context (see Dock.tsx's lookup panel). Each value is the
   *  exact splice closure captured at selection time for stripping that embed's
   *  token back out of its parent. */
  const [selectedEmbedIds, setSelectedEmbedIds] = useState<Map<string, () => void>>(new Map());
  /** The one selected embed, when exactly one is — the single-target actions
   *  (Dock's Edit/Save/Remove/Delete/Move row, annotate/diff processes) only ever
   *  make sense for exactly one embed at a time, same `.length === 1`-style gating
   *  selectedPageCards uses for singleSelectedCard below. */
  const singleSelectedEmbedEntry = selectedEmbedIds.size === 1 ? [...selectedEmbedIds][0] : undefined;
  const singleSelectedEmbed = singleSelectedEmbedEntry
    ? { cardId: singleSelectedEmbedEntry[0], onRemove: singleSelectedEmbedEntry[1] }
    : null;
  /** Plain Set view of `selectedEmbedIds` for props that only need membership, not
   *  each entry's own onRemove closure (CardEditingContext's visual highlighting,
   *  Dock's word/card/quote context) — recomputed each render, same cost as passing
   *  selectedPageCardIds straight through below. */
  const selectedEmbedIdSet = useMemo(() => new Set(selectedEmbedIds.keys()), [selectedEmbedIds]);
  /** Removes one embed from the selection (and, if it was mid-edit, out of
   *  editingEmbedIds too) — leaving every other selected Card/embed untouched. */
  function deselectOneEmbed(cardId: string) {
    setSelectedEmbedIds((prev) => {
      if (!prev.has(cardId)) return prev;
      const next = new Map(prev);
      next.delete(cardId);
      return next;
    });
    setEditingEmbedIds((prev) => {
      if (!prev.has(cardId)) return prev;
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
  }
  /** An embed "in transit" to a Page position (the embed action row's own Move) —
   *  same shape as one `selectedEmbedIds` entry (it *is* what was selected, carried
   *  forward the same way movingPageCardIds carries selectedPageCardIds forward),
   *  but kept as a separate piece of state since entering this mode drops that one
   *  embed back out of the selection (there's no existing PageCard/DockCard row for
   *  an embed the way there is for a Page/Dock Card, so nothing else needs the
   *  selection to persist — see handleEnterEmbedMoveMode). */
  const [movingEmbedCard, setMovingEmbedCard] = useState<{ cardId: string; onRemove: () => void } | null>(
    null,
  );
  /** Embedded Cards (any depth, any number at once) currently in their own inline
   *  edit mode — independent of both `editingPageCardIds` (top-level Cards) and of
   *  each other, so a parent and any combination of its embeds can be editing or not,
   *  each on its own. Keyed by the embedded Card's own id (not a PageCard id, since
   *  embeds have no PageCard of their own) — see CardEmbed.tsx. */
  const [editingEmbedIds, setEditingEmbedIds] = useState<Set<string>>(new Set());
  /** Move Mode (Dock's Move action) — every PageCard id currently "in transit" as one
   *  batch (Step 6 spec §4.2), or empty when not moving. Deliberately not touched by
   *  navigateToPage's deselectAll() call, so it persists across Page navigation (see
   *  PageStack.tsx/Dock.tsx) — moot in practice once Selection Lock (§4.3) is wired
   *  up, since Page navigation is disabled the whole time anything's selected anyway. */
  const [movingPageCardIds, setMovingPageCardIds] = useState<Set<string>>(new Set());
  /** The same ids as `movingPageCardIds`, ordered as they were on their *source*
   *  Page at the moment Move Mode was entered (handleEnterMoveMode) — needed because
   *  reaching a cross-Page destination means navigating away first, at which point
   *  `currentPage` is the destination and no longer has anything to sort these ids
   *  by. See handleDropAt. */
  const [movingPageCardOrder, setMovingPageCardOrder] = useState<string[]>([]);
  /** Every currently-selected Dock Card (by its own id, not cardId) — the same
   *  select-then-add-toggle model as selectedPageCardIds, but for the Dock's own
   *  scratchpad layer (DockCardsPanel.tsx). Mutually exclusive with
   *  selectedPageCardIds/selectedEmbedIds: selecting a Dock Card clears both, so the
   *  Dock's action row is never asked to show two different selections' actions at
   *  once (see toggleSelectDockCard/toggleSelectPageCard/selectEmbed). */
  const [selectedDockCardIds, setSelectedDockCardIds] = useState<Set<string>>(new Set());
  /** Every Dock Card currently in transit to a Page (the Dock Card panel's own Move
   *  Mode) — the same "carry the selection forward, navigate to the destination,
   *  drop at a zone" pattern movingPageCardIds uses (see handleEnterMoveMode's doc
   *  comment), reusing the same live-navigation mechanism rather than a separate
   *  picker: any Page on any Tab is reachable by navigating there while this is
   *  non-empty (see Dock.tsx's page-nav visibility). */
  const [movingDockCardIds, setMovingDockCardIds] = useState<Set<string>>(new Set());
  /** Which extended panel (Step 6 spec §3.2) is open — Vault, Dock Cards, Pages, or
   *  Tabs, never more than one at once. Lifted here so the Dock's own toggles and the
   *  Feed Input Button's "Open" action can all reach it. */
  const [openPanel, setOpenPanel] = useState<DockPanel | null>(null);
  /** The Dock's "reveal hidden cards" toggle — purely a display preference for the
   *  current Page, not tied to any one Card/Tab, so it isn't reset on navigation. */
  const [revealHidden, setRevealHidden] = useState(false);
  /** editingTemplateId — set only by the Template browser's Edit action, cleared by
   *  tapping the Dock's own badge (onStopEditingTemplate). Paired with its name
   *  (not just the id) so the badge doesn't need an extra fetch. */
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateName, setEditingTemplateName] = useState<string | null>(null);
  /** Non-null while the "Save as Template" modal is open — snapshots which Page it
   *  was triggered from at that moment, not read live from currentPage, so
   *  navigating away while the modal is still open can't change the target.
   *  Page-scoped only — Tab is gone (see schema.prisma's Tab doc comment), so
   *  Template creation no longer has a "tab" alternative. */
  const [saveAsTemplateRequest, setSaveAsTemplateRequest] = useState<{ pageId: string } | null>(null);
  const [templateBrowserOpen, setTemplateBrowserOpen] = useState(false);

  const pagesNav = usePagesNav();
  const {
    page: currentPage,
    loading: pageLoading,
    createCardInPage,
    openCardIntoPage,
    refresh,
    updateDraftLocally,
  } = usePage(currentPageId);
  const siblings = useSiblingPages(currentPageId);
  const { ancestors } = usePageAncestors(currentPageId);
  const vault = useVault();
  const dockCards = useDockCards();
  /** A blank Dock Card's own Generate (Dock.tsx's carousel, DockCardView's own
   *  isBlank check) — a separate useGeneration instance from the Page-level
   *  `generation` below, same reasoning StackBody.tsx's own per-Stack instance
   *  has: this fills a Dock Card's own content in place, it doesn't touch the
   *  current Page at all, so there's no reason for the two to share state (and a
   *  Page-level generation and a Dock Card one could otherwise never run at the
   *  same time). onAccepted is just dockCards.refresh — same shape
   *  persistGeneratedToDockCard's own "no GenerateResponse, just refresh" result
   *  gives every other dockCard-target caller (App.tsx's other Dock Card
   *  mutations all already end the same way). */
  const dockCardGeneration = useGeneration(dockCards.refresh);

  /** The Card ids (not PageCard ids — HistoryEntry.cardIds' own convention) behind
   *  the current rail selection — the full state system's Undo/Redo/Back/Forward
   *  auto-scope to this (empty = page-wide) whenever it's read; see useHistory.ts. */
  const selectedCardIds = useMemo(
    () =>
      currentPage ? currentPage.pageCards.filter((pc) => selectedPageCardIds.has(pc.id)).map((pc) => pc.card.id) : [],
    [currentPage, selectedPageCardIds],
  );
  const history = useHistory(currentPageId, selectedCardIds, refresh);

  /** Wraps a structural Page mutation (add/remove/move/freeze/convert a Card, ...)
   *  with a history entry: snapshots `cardIds` from `currentPage` before `mutate`
   *  runs (accurate for a discrete one-shot action like these — unlike the
   *  keystroke-rate text-edit path, see useEditHistoryRecorder.ts), then again from
   *  whatever fresh Page `mutate` itself returns — always its own `refresh()`'s
   *  return value (never the stale `currentPage` closure, which React only updates
   *  on the *next* render, well after this async function has already moved on).
   *  `wholePage` snapshots every PageCard instead of just `cardIds` (add/remove/move
   *  entries need every sibling's order to be able to restore it — see
   *  PageCardSnapshot's doc comment); a plain metadata/type change (freeze,
   *  convert-to-stack) only needs `cardIds`' own slice. */
  async function withHistory(
    kind: "edit" | "generation",
    label: string,
    cardIds: string[],
    mutate: () => Promise<PageWithCards | null | undefined>,
    wholePage = false,
  ) {
    const snap = (p: PageWithCards | null | undefined) =>
      wholePage ? snapshotWholePage(p) : snapshotForCards(p, cardIds);
    const before = snap(currentPage);
    const after = snap(await mutate());
    await history.record(kind, label, cardIds, before, after);
  }

  /** Same shape as withHistory above, for the "create a Card, whose id is only
   *  known once the creating call returns" handlers (createCardInPage/createStack/
   *  uploadFileToPage all return the new PageCardWithCard) — always a whole-page
   *  snapshot, since adding a Card is structural. */
  async function recordCardAdded(before: ReturnType<typeof snapshotWholePage>, label: string, pc: PageCardWithCard) {
    await history.record("edit", label, [pc.card.id], before, snapshotWholePage(await refresh()));
  }

  // First-run / Home bootstrap (Pages + Links + Search rebuild, Phase 4): once
  // settings have loaded, land on Home if one's set; otherwise (a brand-new install)
  // create one and land there. Untitled — "Home" is a role (UserSettings.homePageId
  // points at it), not a forced title; an untitled Page is a valid, common state
  // (see schema.prisma's Page.title doc comment) and Home is no exception.
  useEffect(() => {
    if (pagesNav.loading || currentPageId) return;
    if (pagesNav.homePageId) {
      setCurrentPageId(pagesNav.homePageId);
      return;
    }
    api.createPage().then((page) => {
      pagesNav.setHome(page.id);
      setCurrentPageId(page.id);
    });
  }, [pagesNav.loading, pagesNav.homePageId, currentPageId, pagesNav.setHome]);

  // Re-settles onto Home if the Page currently in view was deleted out from under it
  // elsewhere (usePage's own fetch comes back null once loading finishes).
  useEffect(() => {
    if (pageLoading || currentPage || !currentPageId || !pagesNav.homePageId) return;
    if (currentPageId === pagesNav.homePageId) return;
    setCurrentPageId(pagesNav.homePageId);
  }, [pageLoading, currentPage, currentPageId, pagesNav.homePageId]);

  // Auto-saves the moment a generation lands (cleanly or via Stop) — no separate
  // review step. onGenerationAccepted (below) always starts with `refresh()`
  // re-fetching `pages` so the newly-saved Card shows up — useGeneration.ts awaits
  // the whole handler before clearing its own ghost-card state, so there's no flash
  // of "nothing there" in between.
  const generation = useGeneration(onGenerationAccepted);
  const agentLoop = useAgentLoop();
  const annotations = useAnnotations();
  /** The Feed/Circle "guide the next generation" flow's own in-flight agent run
   *  (Brilliantly Simple Generation Agent plan) — replaces the old AUTORUN action-card
   *  chain entirely; a typed instruction now runs useAgentLoop's tool-calling loop
   *  instead of a self-driving interactive-mode generation. `agentAbortControllerRef`
   *  is what the Stop button cancels; `agentNotice`/`agentError` surface through the
   *  same Dock banner slots the old autoRunNotice/autoRunError did. */
  const [agentRunning, setAgentRunning] = useState(false);
  const agentAbortControllerRef = useRef<AbortController | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentNotice, setAgentNotice] = useState<string | null>(null);
  /** Captured right before a generation start/startAndWait call fires (the actual
   *  call sites are below — handleGeneratePage and the "promptCard" action job) so
   *  onGenerationAccepted, once the stream lands, has something to diff against for
   *  the Back/Forward version entry. `cardIds` is the selection/target the
   *  generation was invoked against — empty for "nothing selected" (the Circle's
   *  page-bottom append), in which case onGenerationAccepted falls back to tagging
   *  the newly-landed Card's own id instead. */
  const pendingGenerationRef = useRef<{ cardIds: string[]; before: PageCardSnapshot[] } | null>(null);

  async function onGenerationAccepted(result?: GenerateResponse) {
    const pending = pendingGenerationRef.current;
    pendingGenerationRef.current = null;
    const freshPage = await refresh();
    if (pending && result) {
      const cardIds = pending.cardIds.length > 0 ? pending.cardIds : [result.card.id];
      await history.record("generation", "Generated card", cardIds, pending.before, snapshotWholePage(freshPage));
    }
    if (!result) return;

    // "input" Cards are answered by a human, not run — this just materializes the
    // generated script into real metadata.input. See generatedInputCard.ts's own
    // doc comment. (A plain, no-instruction generation essentially never produces
    // one — generate/system.md doesn't teach the format — but a Prompt Card's own
    // instruction-guided generation still can.)
    if (getCardTypeId(result.card) === "input") {
      const inputResult = await materializeGeneratedInputCard(result.card);
      if (inputResult.errors.length > 0) {
        setAgentError(`${t("generate.autoRunParseError")} ${inputResult.errors.join("; ")}`);
      }
    }
  }

  /**
   * Feed/Circle's own guide-text flow (Brilliantly Simple Generation Agent plan,
   * replacing the old AUTORUN action-card chain) — runs useAgentLoop's tool-calling
   * loop, scoped to the whole current Page, then refreshes so whatever it created/
   * edited/reordered shows up. Empty Circle (handleGeneratePage below, no
   * instruction) never reaches this — it stays on the plain, cheap single-card
   * stream, unchanged.
   */
  async function handleRunAgentForPage(instruction: string) {
    if (!currentPage) return;
    setAgentError(null);
    setAgentNotice(null);
    const controller = new AbortController();
    agentAbortControllerRef.current = controller;
    setAgentRunning(true);
    // Whole-page snapshot: a tool-calling run can touch arbitrary Cards, not just
    // one — see the Back/Forward entry recorded below. `cardIds` tags whatever was
    // selected when the run was invoked (empty when nothing was, same "page-only"
    // fallback matchesScope gives an empty tag).
    const before = snapshotWholePage(currentPage);
    const cardIds = selectedCardIds;
    try {
      const outcome = await agentLoop.runAgent({
        scope: "page",
        instruction,
        page: currentPage,
        onRunActionJob: handleRunActionJob,
        // A round's own tool names as a live "Running X…" status, reusing the
        // Dock's existing generationNotice banner rather than adding a new UI
        // element — overwritten by the very next round, and by the final
        // status below once the run actually ends.
        onProgress: (event) => {
          if (event.toolNames.length > 0) setAgentNotice(`${t("generate.agentRunning")} ${event.toolNames.join(", ")}…`);
        },
        signal: controller.signal,
      });
      const freshPage = await refresh();
      await history.record("generation", "Agent run", cardIds, before, snapshotWholePage(freshPage));
      if (outcome.status === "max_rounds") setAgentNotice(t("generate.autoRunChainCapped"));
      else if (outcome.status === "paused_for_input") setAgentNotice(t("generate.agentPausedForInput"));
      else setAgentNotice(null);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : "Agent run failed");
    } finally {
      agentAbortControllerRef.current = null;
      setAgentRunning(false);
    }
  }

  /** The Feed Input Button's Stop action — aborts whichever of the two generation
   *  paths is actually running (the plain stream, or the agent loop); both are safe
   *  to call unconditionally when idle. */
  function handleStopGeneration() {
    agentAbortControllerRef.current?.abort();
    generation.stop();
  }

  // The currently-selected Card/embed's own live annotations, for the Dock's process/
  // accept-all-diffs actions (pendingDiffCount) — an embed's Card only lives in
  // cardStore (not `pages`), so it needs its own subscription; a top-level
  // singleSelectedCard's Card comes back through `pages` on every refresh() below,
  // which every annotation mutation triggers (see the handle* wrappers). Keyed off
  // singleSelectedEmbed (only ever non-null when exactly one embed is selected) —
  // several embeds can be selected at once now (selectedEmbedIds below), but this
  // single-target subscription only ever needs to follow one of them.
  const selectedEmbedCard = useSyncExternalStore(
    (onChange) => (singleSelectedEmbed ? subscribeToCard(singleSelectedEmbed.cardId, onChange) : () => {}),
    () => (singleSelectedEmbed ? getCachedCard(singleSelectedEmbed.cardId) : undefined),
  );

  /** A tap on a Card's own selection rail toggles its membership in the current
   *  (possibly multi-Card) selection — tapping a not-yet-selected Card adds it,
   *  tapping an already-selected one removes it again. Independent of
   *  editingPageCardIds now (Card Feed Interaction plan): rail-selection and the
   *  active text editor are two separate, orthogonal states — deselecting a Card
   *  here doesn't stop it from being edited if it happens to be the active editor
   *  (see exitEditPageCard below for that), and a Card can be the active editor
   *  without ever being selected here at all. Cards and embeds can coexist in the
   *  selection now — only Dock Card selection stays its own separate single-select
   *  mechanism, untouched by this. */
  function toggleSelectPageCard(id: string) {
    setSelectedPageCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    // Mutually exclusive with Dock Card selection (see toggleSelectDockCard) — the
    // Dock's action row only ever shows one *kind* of selection's actions at a time.
    setSelectedDockCardIds(new Set());
  }

  /** Exits editing for this one Card, leaving rail-selection (selectedPageCardIds)
   *  entirely untouched — editing and selection are independent state now (Card
   *  Feed Interaction plan), so closing the editor never implicitly deselects
   *  anything, and never needs to: this Card may not have been selected at all.
   *  The click-outside-to-close effect (Card.tsx's onCloseEditor) calls this. */
  function exitEditPageCard(id: string) {
    setEditingPageCardIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  /** Deselects the selected Card — the Dock's own back-caret action and
   *  empty-space-tap (wired up via the pointerdown effect below). The Card stays
   *  right where it is on the Page; this only clears selection. */
  function deselectAll() {
    setSelectedPageCardIds(new Set());
    setEditingPageCardIds(new Set());
  }

  /** Every currently-selected Dock Card's own underlying Card id — editingEmbedIds
   *  (which Dock Cards share with page-embedded Cards, both being draftless/
   *  write-through) is keyed by cardId, while selectedDockCardIds is keyed by the
   *  DockCard row's own id, so anything toggling both needs this mapping. */
  const selectedDockCardCardIds = useMemo(
    () =>
      dockCards.dockCards.filter((dc) => selectedDockCardIds.has(dc.id)).map((dc) => dc.cardId),
    [dockCards.dockCards, selectedDockCardIds],
  );

  /** The formatting toolbar's own back-caret (Dock.tsx) — ends editing the same way
   *  each surface's own click-outside-to-close gesture already does: a Page Card
   *  just exits editing (exitEditPageCard — independent of selection now, see its
   *  own doc comment), same as an editing selected embed (deselectOneEmbed — only
   *  that one, leaving any other selected Cards/embeds alone); a Dock Card just
   *  drops out of edit mode and stays selected (toggleEditEmbed), same as
   *  CardEmbed.tsx's own click-outside effect does for it. Checked in the same
   *  priority order isEditingActive uses. editingPageCardIds is always at most one
   *  Card now (activatePageCardEditor never adds a second without first replacing
   *  the first), so there's nothing to disambiguate by intersecting with selection
   *  the way this used to. */
  function exitEditing() {
    const editingSelectedEmbedId = [...selectedEmbedIds.keys()].find((id) => editingEmbedIds.has(id));
    if (editingSelectedEmbedId) {
      deselectOneEmbed(editingSelectedEmbedId);
      return;
    }
    const editingPageCardId = [...editingPageCardIds][0];
    if (editingPageCardId) {
      exitEditPageCard(editingPageCardId);
      return;
    }
    const editingDockCardId = selectedDockCardCardIds.find((cardId) => editingEmbedIds.has(cardId));
    if (editingDockCardId) {
      toggleEditEmbed(editingDockCardId);
    }
  }

  /** A plain tap on a Dock Card (DockCardsPanel.tsx's onToggleSelect) — same
   *  replace-selection-or-jump-to-edit convention as toggleSelectPageCard (only one
   *  Dock Card selected at a time), and likewise mutually exclusive with Page
   *  Card/embed selection, so the Dock shows the same kind of Move/Close row a
   *  selected Page Card gets. */
  function toggleSelectDockCard(id: string) {
    if (selectedDockCardIds.has(id)) {
      const dc = dockCards.dockCards.find((d) => d.id === id);
      if (dc) setEditingEmbedIds((prev) => (prev.has(dc.cardId) ? prev : new Set(prev).add(dc.cardId)));
      return;
    }
    setSelectedDockCardIds(new Set([id]));
    setSelectedPageCardIds(new Set());
    setEditingPageCardIds(new Set());
    setSelectedEmbedIds(new Map());
  }

  /** Deselects every selected Dock Card — the multi-select "Close" action for the
   *  Dock's own scratchpad, mirroring deselectAll above. */
  function deselectDockCards() {
    const cardIds = selectedDockCardCardIds;
    setSelectedDockCardIds(new Set());
    setEditingEmbedIds((prev) => {
      if (!cardIds.some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of cardIds) next.delete(id);
      return next;
    });
  }

  /** The Dock's "Move to Page" action while one or more Dock Cards are selected —
   *  enters Move Mode (mirrors handleEnterMoveMode above) rather than moving
   *  immediately: the destination — any Page, on any Tab — is picked by navigating
   *  there and tapping a drop zone, the same live-navigation mechanism
   *  movingPageCardIds already uses (see Dock.tsx's page-nav visibility during a
   *  move, and PageStack.tsx's DropZones). Closes whatever panel was open (most
   *  likely the Dock Cards panel itself, still showing the Card just selected from
   *  it) so the screen lands on a clean page view to navigate from, rather than
   *  leaving that panel's content sitting above the very drop zones you'd use next. */
  function handleEnterDockCardMoveMode() {
    if (selectedDockCardIds.size === 0) return;
    setMovingDockCardIds(new Set(selectedDockCardIds));
    setOpenPanel(null);
  }

  function handleCancelDockCardMove() {
    setMovingDockCardIds(new Set());
  }

  /** The Dock Card Move Mode drop target (PageStack.tsx's DropZone, shown there
   *  whenever movingDockCardIds is non-empty) — moves the whole batch to destIndex
   *  together, preserving their relative Dock order. Sequential, not parallel, same
   *  reasoning as handleDropAt's batch move: each call re-reads the destination
   *  Page's sibling order fresh from the DB. */
  async function handleDropDockCardAt(destPageId: string, destIndex: number) {
    if (movingDockCardIds.size === 0) return;
    const ids = dockCards.dockCards
      .filter((dc) => movingDockCardIds.has(dc.id))
      .sort((a, b) => a.order - b.order)
      .map((dc) => dc.id);
    setMovingDockCardIds(new Set());
    deselectDockCards();
    for (let i = 0; i < ids.length; i++) {
      await dockCards.moveToPage(ids[i], destPageId, destIndex + i);
    }
    await refresh();
  }

  /** The Dock's "Close" action while one or more Dock Cards are selected — unlike a
   *  selected Page Card's Close (deselectAll, just clears selection), this actually
   *  removes each one: dockCardService.removeDockCard deletes the underlying Card
   *  outright if it was never saved to the vault, or just unpins it from the Dock
   *  (leaving the vault Card untouched) if it was. */
  async function handleCloseSelectedDockCards() {
    if (selectedDockCardIds.size === 0) return;
    const ids = [...selectedDockCardIds];
    deselectDockCards();
    for (const id of ids) {
      await dockCards.removeDockCard(id);
    }
  }

  // Tapping empty page space deselects everything (Step 6 spec §4.1) — a global
  // pointerdown listener rather than an onClick on the page-stack container, since a
  // plain bubbling onClick there would also fire (and immediately undo) every Card's
  // own click-to-select just tapped a moment earlier. Same "outside" convention as
  // Card.tsx/CardEmbed.tsx/Dock.tsx's own click-outside effects: anything inside a
  // Card shell or the Dock doesn't count as "empty space". Skipped entirely during
  // Move Mode — a stray background tap shouldn't interrupt an in-progress move.
  useEffect(() => {
    if (
      (selectedPageCardIds.size === 0 && selectedDockCardIds.size === 0) ||
      movingPageCardIds.size > 0 ||
      movingDockCardIds.size > 0
    )
      return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element;
      if (target.closest(".card-shell") || target.closest(".dock")) return;
      deselectAll();
      deselectDockCards();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [selectedPageCardIds, selectedDockCardIds, movingPageCardIds, movingDockCardIds]);

  // Double-click / long-press a Card, or its own header's explicit edit icon
  // (Card.tsx/etc.'s headerActions) — adds it to editing (and to the selection, if
  // it wasn't already) *alongside* whatever else is currently selected, same
  // cumulative spirit as toggleSelectPageCard above. Unlike that function, this
  // always ensures the Card ends up both selected and editing, even if it was
  // already selected but not yet editing.
  function requestEditPageCard(id: string) {
    setSelectedPageCardIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    setEditingPageCardIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    setSelectedDockCardIds(new Set());
  }

  /** Marks a Card as the Dock's own formatting-toolbar target — forks first if it's
   *  frozen (Open/Frozen — Wattle vault plan; not that this ever actually happens
   *  today, since a frozen Card's title/content don't render as focusable to begin
   *  with — see Card.tsx), then makes it the sole entry in editingPageCardIds.
   *  Deliberately does NOT touch selectedPageCardIds either way: this and
   *  rail-selection are independent state — a Card can be the Dock's formatting
   *  target without being selected at all, while a completely different batch of
   *  Cards stays selected for Dock's own Save/Move/Hide/Remove actions the whole
   *  time. Called by Card.tsx's own onActivateEditor prop, wired to that Card's
   *  onFocus (its title or its rich text — content is always directly editable
   *  now, there's no separate mode to "enter"). Only one Card can be the Dock's
   *  target at once — entering here always replaces whichever Card held it
   *  before. */
  async function activatePageCardEditor(id: string) {
    const pageCard = currentPage?.pageCards.find((pc) => pc.id === id);
    if (pageCard?.card.frozenAt) {
      await api.forkPageCardOccurrence(id);
      await refresh();
    }
    setEditingPageCardIds(new Set([id]));
  }

  /** Selects an embedded Card independently of whatever top-level Card contains it —
   *  clicking the same one again deselects it, same click-to-select/
   *  click-to-deselect toggle convention toggleSelectPageCard uses for top-level
   *  Cards, and likewise cumulative: several embeds (and any combination of
   *  top-level Cards) can be selected at once now, all feeding the Dock's combined
   *  "many selections" context (editing is reached only via double-click/long-press
   *  — requestEditEmbed below — not a second tap). Deliberately doesn't touch
   *  selectedPageCardIds/editingPageCardIds: the containing Card stays exactly as
   *  selected/editing as it was. */
  function selectEmbed(cardId: string, onRemove: () => void) {
    if (selectedEmbedIds.has(cardId)) {
      deselectOneEmbed(cardId);
      return;
    }
    setSelectedEmbedIds((prev) => new Map(prev).set(cardId, onRemove));
    setSelectedDockCardIds(new Set());
  }

  /** Double-click / long-press an embedded Card (CardEmbed.tsx) to jump straight into
   *  editing it — adds it to the selection (and to editing) *alongside* whatever
   *  else is currently selected, same cumulative spirit as requestEditPageCard above
   *  for top-level Cards. Deliberately not a toggle (repeat double-clicks/long-presses
   *  on an already-editing embed just leave it as is), and deliberately doesn't touch
   *  any other Card/embed's state. */
  function requestEditEmbed(cardId: string, onRemove: () => void) {
    setSelectedEmbedIds((prev) => (prev.has(cardId) ? prev : new Map(prev).set(cardId, onRemove)));
    setEditingEmbedIds((prev) => (prev.has(cardId) ? prev : new Set(prev).add(cardId)));
  }

  /** Toggles one embedded Card's own inline edit mode on/off — the Dock's Edit action
   *  for a selected embed, and also what CardEmbed.tsx's click-outside effect calls to
   *  close it (mirroring Card.tsx's "there's no separate Done action" convention).
   *  Deliberately independent of `selectedEmbedIds`/`editingPageCardIds` — toggling
   *  one embed's edit state never touches selection or any other Card's edit state. */
  function toggleEditEmbed(cardId: string) {
    setEditingEmbedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }

  /** "Add to page" (Dock.tsx's own selected-embed row) — appends the embedded
   *  Card at the bottom of the current Page as its own standalone PageCard,
   *  alongside staying embedded right where it already is (same live Card, two
   *  places it's now reachable from). Only ever meaningful when exactly one
   *  embed is selected (singleSelectedEmbed) — same gating every other
   *  single-embed action here uses. */
  async function handleAddEmbedToPage() {
    if (!singleSelectedEmbed || !currentPage) return;
    await api.addExistingCardToPage(currentPage.id, singleSelectedEmbed.cardId);
    await refresh();
  }

  /** Freezes the selected embed's own underlying Card — same gating
   *  handleFreezeSelected uses for a top-level Card (Dock.tsx's own row already
   *  only shows this once selectedEmbedCard is savedToVault and not already
   *  Frozen). */
  async function handleFreezeEmbed() {
    if (!singleSelectedEmbed) return;
    await api.freezeCard(singleSelectedEmbed.cardId);
    await refresh();
  }

  /** Flips `metadata.hidden` on the selected embed's own underlying Card — same
   *  "writes straight through" convention handleToggleHiddenSelected uses for a
   *  top-level Card. */
  function handleToggleHiddenEmbed() {
    if (!singleSelectedEmbed || !selectedEmbedCard) return;
    editCard(selectedEmbedCard.id, {
      metadata: { ...selectedEmbedCard.metadata, hidden: !selectedEmbedCard.metadata.hidden },
    });
  }

  /** The Dock's own back-caret action (the one universal way to deselect now,
   *  across Page Cards/Dock Cards/embeds alike) while an embed is selected — clears
   *  every selected embed at once (distinct from deselectOneEmbed, which drops just
   *  one out of a larger selection), same as deselectAll/deselectDockCards, leaving
   *  every embed exactly where it is. Distinct from Remove (strips the token) and
   *  Delete (strips the token and deletes the underlying Card) — those stay their
   *  own explicit actions, this only clears selection/editing state. */
  function handleDeselectEmbed() {
    setEditingEmbedIds((prev) => {
      if (![...selectedEmbedIds.keys()].some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of selectedEmbedIds.keys()) next.delete(id);
      return next;
    });
    setSelectedEmbedIds(new Map());
  }

  /** The embed action row's own Move — enters Move Mode the same way
   *  handleEnterMoveMode does for Page Cards, carrying the one selected embed
   *  forward as `movingEmbedCard` rather than a PageCard id (there isn't one yet —
   *  see movingEmbedCard's own doc comment). Only ever meaningful when exactly one
   *  embed is selected (singleSelectedEmbed) — same gating as
   *  handleRemoveEmbed/handleDeleteEmbed. Closes whatever panel was open, same
   *  reasoning as handleEnterDockCardMoveMode. */
  function handleEnterEmbedMoveMode() {
    if (!singleSelectedEmbed) return;
    setMovingEmbedCard(singleSelectedEmbed);
    setSelectedEmbedIds((prev) => {
      const next = new Map(prev);
      next.delete(singleSelectedEmbed.cardId);
      return next;
    });
    setOpenPanel(null);
  }

  // Restores the selection rather than leaving nothing selected, so Cancel lands
  // back on the embed's own action row — same place Page Card Move Mode's Cancel
  // lands (selectedPageCardIds is never cleared to begin with there).
  function handleCancelEmbedMove() {
    if (movingEmbedCard) {
      setSelectedEmbedIds((prev) => new Map(prev).set(movingEmbedCard.cardId, movingEmbedCard.onRemove));
    }
    setMovingEmbedCard(null);
  }

  /** The Move Mode drop target for an embed (PageStack.tsx's DropZone) — appends the
   *  embedded Card as a real PageCard, then repositions it to the exact dropped
   *  index (addExistingCardToPage only ever appends at the bottom), and only *then*
   *  strips the `[[cardId]]` token out of its old parent — in that order, so a
   *  failure partway through never deletes the reference without anywhere for the
   *  Card to have landed. */
  async function handleDropEmbedAt(destPageId: string, destIndex: number) {
    if (!movingEmbedCard) return;
    const { cardId, onRemove } = movingEmbedCard;
    setMovingEmbedCard(null);
    const pageCard = await api.addExistingCardToPage(destPageId, cardId);
    await api.movePageCard(pageCard.id, destPageId, destIndex);
    onRemove();
    await refresh();
  }

  /** Move's own "drop onto the Dock" destination for an embed (Dock.tsx's
   *  dockCardsAction, tapped while embedMoving) — same add-then-strip-then-open
   *  sequencing as handleDropEmbedAt, but landing in the Dock instead of a Page.
   *  Reads movingEmbedCard rather than selectedEmbedIds: entering embed Move Mode
   *  already dropped that one embed back out of the selection (see
   *  handleEnterEmbedMoveMode). */
  async function handleMoveEmbedToDock() {
    if (!movingEmbedCard) return;
    const { cardId, onRemove } = movingEmbedCard;
    setMovingEmbedCard(null);
    await dockCards.addExistingCard(cardId);
    onRemove();
  }

  // A focused Card only ever makes sense while it's still actually on the current
  // Page — if it was removed, or the Page changed out from under it (e.g. Page nav,
  // still reachable from inside the fullscreen view since the Dock stays up), just
  // fall back to the normal Page view instead of showing an empty fullscreen shell.
  useEffect(() => {
    if (focusedPageCardId && !currentPage?.pageCards.some((pc) => pc.id === focusedPageCardId)) {
      setFocusedPageCardId(null);
    }
  }, [focusedPageCardId, currentPage]);

  const focusedPage =
    currentPage && focusedPageCardId
      ? { ...currentPage, pageCards: currentPage.pageCards.filter((pc) => pc.id === focusedPageCardId) }
      : null;

  /** The header's top-right "+" corner button (Card.tsx) for a plain "note" Card —
   *  turns it into a Stack and immediately adds a second (blank) alternate, in one
   *  step. A Stack Card's own "+" doesn't call this at all — StackBody.tsx adds an
   *  alternate directly via its own useCardStack instance. */
  /** Card.tsx's useEditHistoryRecorder fires this once a title/content edit burst
   *  settles (via PageStack's onRecordEditHistory prop) — one Undo/Redo entry per
   *  pause/edit-session, the confirmed coarse-grained decision. */
  function handleRecordEditHistory(before: PageCardSnapshot, after: PageCardSnapshot) {
    void history.record("edit", "Edited card", [before.cardId], [before], [after]);
  }

  async function handleTurnIntoStackWithNewCard(pageCardId: string) {
    const cardId = currentPage?.pageCards.find((pc) => pc.id === pageCardId)?.card.id;
    await withHistory("edit", "Turned into Stack", cardId ? [cardId] : [], async () => {
      const converted = await api.convertCardToStack(pageCardId);
      await api.addStackMember(converted.card.id);
      return refresh();
    });
  }

  /** PageStack's own title header (Pages + Links + Search rebuild, Phase 1's "Show
   *  Page title on the current Page (inline rename)") — commits straight to the
   *  server; `refresh()` picks up the new title the same way any other Page mutation
   *  does. */
  async function handleRenamePage(title: string) {
    if (!currentPageId) return;
    await api.renamePage(currentPageId, title);
    await refresh();
  }

  /** True while a Page Card, a Dock Card, or an embed is in its own inline edit mode
   *  *and* actually has rich text to format — Dock.tsx swaps its action row for the
   *  formatting toolbar (bold/italic/heading/lists) for exactly this long. A Page
   *  Card whose CardType isn't "note" (e.g. "action") has nothing there to format,
   *  so editing one of those does *not* count here — the Dock keeps showing that
   *  Card's ordinary selection actions (Move/Remove/Save/etc.) instead of a toolbar
   *  with nothing relevant to do. Embeds and Dock Cards are always "note"-shaped
   *  content, so those two clauses are unconditional. Independent of
   *  selectedPageCardIds now (Card Feed Interaction plan) — a Page Card can be the
   *  active editor without being selected at all, and this still reacts to it. */
  const editingPageCard = currentPage?.pageCards.find((pc) => editingPageCardIds.has(pc.id));
  const isEditingActive =
    [...selectedEmbedIds.keys()].some((cardId) => editingEmbedIds.has(cardId)) ||
    (editingPageCard ? getCardTypeId(editingPageCard.card) === "note" : false) ||
    selectedDockCardCardIds.some((cardId) => editingEmbedIds.has(cardId));

  // Selection Lock (Step 6 spec §4.3): Page navigation is disabled the whole time one
  // or more Cards are selected — the user has to deselect first. Move Mode is
  // deliberately exempt: it carries the selection forward (handleEnterMoveMode), but
  // moving a Card to a *different* Page (§4.2) has always worked by navigating there
  // first (Search/Home/pins/the optional sibling trail) and dropping at a zone on the
  // newly-viewed Page — locking navigation during Move Mode too would make that
  // destination unreachable entirely.
  const navigationLocked = selectedPageCardIds.size > 0 && movingPageCardIds.size === 0;
  const canNavigateUp = !navigationLocked && siblings.canNavigateUp;
  const canNavigateDown = !navigationLocked && siblings.canNavigateDown;

  /** Which way the Page transition animation should play (PageStack.tsx) — "up"
   *  slides the new Page in from below, "down" from above; null (Search/Home/pins/
   *  Page-link navigation, none of which have a spatial "direction") skips the
   *  animation. Set right before the Page actually changes so PageStack's remount
   *  (keyed on the new Page's id) picks up the right direction class on first paint. */
  const [navDirection, setNavDirection] = useState<"up" | "down" | null>(null);

  /** Recent-Pages history (Pages + Links + Search rebuild, Phase 2's nav-chrome
   *  "back/forward or recent Pages") — Home/Search/pins/Page-links/the sibling trail
   *  don't have a spatial "up/down" relationship to each other the way former
   *  Tab-stack neighbors did, so a browser-style back/forward stack (not another
   *  index into some ordered list) is what lets you retrace an arbitrary path
   *  through them. Plain ids, most-recent-last; `back`/`goForward` below are the only
   *  things that ever read past the top. */
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [pageForwardHistory, setPageForwardHistory] = useState<string[]>([]);

  /** Navigates straight to any Page by id — Home/pins/Search/a Page link/the
   *  optional sibling trail, and Move Mode's own "go there, then drop" flow, all
   *  route through here, so there's one shared Selection Lock choke point and one
   *  place that resets selection. usePage's own `pageId` effect handles the actual
   *  refetch once `currentPageId` changes — no explicit refresh() needed here.
   *  `fromHistory` is only ever set by goBack/goForward themselves, which manage
   *  `pageHistory`/`pageForwardHistory` directly — every other caller pushes the
   *  Page it's leaving onto `pageHistory` and clears the forward stack, same as a
   *  browser tab's own history following a fresh navigation. */
  function navigateToPage(
    pageId: string,
    direction: "up" | "down" | null = null,
    fromHistory?: "back" | "forward",
  ) {
    // Selection Lock (Step 6 spec §4.3) — Move Mode is exempt, see navigationLocked's
    // doc comment above.
    if (selectedPageCardIds.size > 0 && movingPageCardIds.size === 0) return;
    if (pageId === currentPageId) return;
    if (!fromHistory && currentPageId) {
      setPageHistory((h) => [...h, currentPageId]);
      setPageForwardHistory([]);
    }
    setNavDirection(direction);
    setCurrentPageId(pageId);
    deselectAll();
  }

  function goBack() {
    const prev = pageHistory[pageHistory.length - 1];
    if (!prev || !currentPageId) return;
    setPageHistory((h) => h.slice(0, -1));
    setPageForwardHistory((f) => [currentPageId, ...f]);
    navigateToPage(prev, null, "back");
  }

  function goForward() {
    const next = pageForwardHistory[0];
    if (!next || !currentPageId) return;
    setPageForwardHistory((f) => f.slice(1));
    setPageHistory((h) => [...h, currentPageId]);
    navigateToPage(next, null, "forward");
  }

  function navigateUp() {
    if (!canNavigateUp || !siblings.previousId) return;
    navigateToPage(siblings.previousId, "up");
  }

  function navigateDown() {
    if (!canNavigateDown || !siblings.nextId) return;
    navigateToPage(siblings.nextId, "down");
  }

  function handleGoHome() {
    if (!pagesNav.homePageId) return;
    navigateToPage(pagesNav.homePageId);
  }

  const isCurrentPagePinned = currentPageId ? pagesNav.pinned.some((p) => p.id === currentPageId) : false;

  function handleTogglePinCurrent() {
    if (!currentPageId) return;
    void pagesNav.togglePin(currentPageId);
  }

  // Lets a `pageLink` node's click (PageLinkNodeView.tsx), anywhere in the document
  // tree, navigate here without a prop threaded all the way down — same shape as the
  // quickAddRegistry effect below.
  useEffect(() => {
    registerPageNavHandler((pageId) => navigateToPage(pageId));
  });

  /** Creates a brand-new loose Page and navigates straight to it — the "+" in the
   *  Dock's page-nav cluster, and the "newBlankPage"/"newBlankTab" Action Card jobs
   *  (both collapse to the same thing now that Tab isn't a place — see
   *  schema.prisma's Tab doc comment). */
  async function handleCreateNewPage() {
    const page = await api.createPage();
    navigateToPage(page.id, "down");
  }

  // Selection Lock (§4.3) keeps Page navigation disabled the whole time this is
  // non-empty, so every selected id is guaranteed to still belong to currentPage.
  const selectedPageCards = useMemo(
    () => (currentPage?.pageCards ?? []).filter((pc) => selectedPageCardIds.has(pc.id)),
    [currentPage, selectedPageCardIds],
  );

  // Annotations (diff/footnote/highlight) and the Dock's process actions only ever
  // resolve against a *single* Card — running one across a multi-selection isn't a
  // case Step 6 defines, so this is null whenever more than one Card is selected,
  // same as when none are.
  const singleSelectedCard = selectedPageCards.length === 1 ? selectedPageCards[0] : null;

  // Which Card a Dock process action would run against — a single selected embed
  // takes priority, same convention as selectedEmbedId elsewhere (Dock.tsx/richtext/
  // CardRichText.tsx). Null when nothing's selected (or more than one Card/embed is).
  const dockAnnotationCardId = singleSelectedEmbed?.cardId ?? singleSelectedCard?.card.id ?? null;
  // An embed never has one (embeds always write straight through to the vault, no
  // draft step) — only a top-level singleSelectedCard's own PageCard id counts here.
  const dockAnnotationPageCardId = singleSelectedEmbed ? undefined : singleSelectedCard?.id;
  const dockAnnotations = singleSelectedEmbed
    ? (selectedEmbedCard?.metadata.annotations ?? [])
    : (singleSelectedCard?.card.metadata.annotations ?? []);
  const pendingDiffCount = dockAnnotations.filter((a) => a.type === "diff").length;

  // Every annotation mutation also refreshes `pages` — same defensive convention
  // handleSave uses, and useGeneration.ts's own auto-save does internally — so a
  // not-yet-saved-to-vault Card's draft view (Card.tsx, which reads `pageCard.card`
  // directly rather than through the live cardStore cache in that state) picks up
  // the change too, and so the Dock's pendingDiffCount above stays correct for the
  // top-level-Card case.
  //
  // `pageCardId` is the extra param Card.tsx's own wrapping closures (not the plain
  // callback type threaded through CardContent/CardEmbed/AnnotatedText) supply for a
  // top-level Card, so the API can resolve draft content instead of the vault Card's
  // own row — see annotationService.ts's resolveDraftTarget doc comment. An embed
  // never has one (embeds always write straight through to the vault, no draft step).
  // TEMP DEBUG — remove once the annotation-run-doesn't-do-anything issue is
  // diagnosed. Logs entry (with the exact args reaching App.tsx from the Dock/
  // AnnotatedText/SelectionMenu) and confirms the post-mutation refresh() actually
  // ran, since a silent throw inside refresh() would otherwise look identical to
  // "nothing happened" from the UI's perspective.
  async function handleRunProcess(
    cardId: string,
    process: AnnotationProcess,
    selectionText?: string,
    pageCardId?: string,
    instruction?: string,
  ) {
    console.debug("[annot] App.handleRunProcess", { cardId, process, selectionText, pageCardId, instruction });
    await annotations.runProcess(cardId, process, selectionText, pageCardId, instruction);
    await refresh();
    console.debug("[annot] App.handleRunProcess refresh() done");
  }
  async function handleCreateManualHighlight(cardId: string, anchor: string, color: string, pageCardId?: string) {
    console.debug("[annot] App.handleCreateManualHighlight", { cardId, anchor, color, pageCardId });
    await annotations.createManualHighlight(cardId, anchor, color, pageCardId);
    await refresh();
    console.debug("[annot] App.handleCreateManualHighlight refresh() done");
  }
  async function handleAcceptDiff(cardId: string, annotationId: string, pageCardId?: string) {
    console.debug("[annot] App.handleAcceptDiff", { cardId, annotationId, pageCardId });
    await annotations.acceptDiff(cardId, annotationId, pageCardId);
    await refresh();
    console.debug("[annot] App.handleAcceptDiff refresh() done");
  }
  async function handleAcceptAllDiffs(cardId: string, pageCardId?: string) {
    console.debug("[annot] App.handleAcceptAllDiffs", { cardId, pageCardId });
    await annotations.acceptAllDiffs(cardId, pageCardId);
    await refresh();
    console.debug("[annot] App.handleAcceptAllDiffs refresh() done");
  }
  async function handleRemoveAnnotation(cardId: string, annotationId: string) {
    console.debug("[annot] App.handleRemoveAnnotation", { cardId, annotationId });
    await annotations.removeAnnotation(cardId, annotationId);
    await refresh();
    console.debug("[annot] App.handleRemoveAnnotation refresh() done");
  }
  async function handleUpdateAnnotationText(cardId: string, annotationId: string, text: string) {
    console.debug("[annot] App.handleUpdateAnnotationText", { cardId, annotationId, text });
    await annotations.updateAnnotationText(cardId, annotationId, text);
    await refresh();
    console.debug("[annot] App.handleUpdateAnnotationText refresh() done");
  }

  // The "nothing selected" counterpart — the Feed Input Button's Circle when only a
  // Page is in view. Appends at the bottom of the Page instead of directly below a
  // specific Card; see generationService.persistGeneratedCardToPage.
  // `instruction`, if the Feed Input Button's expanded text field had content, guides
  // this generation instead of relying purely on existing context (Step 6 spec §2.2).
  function handleGeneratePage(instruction?: string) {
    if (!currentPage) return;
    if (!instruction || !instruction.trim()) {
      // Empty Circle — unchanged, today's cheap single-card stream (no agent, no
      // instruction/actionsDoc vocabulary). No specific source Card (nothing's
      // selected here by definition), so onGenerationAccepted tags the entry with
      // the newly-landed Card's own id instead — see pendingGenerationRef's doc
      // comment.
      pendingGenerationRef.current = { cardIds: [], before: snapshotWholePage(currentPage) };
      generation.startForPage(currentPage.id);
      return;
    }
    // Guide text present — runs the tool-calling agent instead of the old
    // interactive-mode/AUTORUN generation (Brilliantly Simple Generation Agent plan).
    void handleRunAgentForPage(instruction);
  }

  async function handleFreezeSelected() {
    if (!singleSelectedCard) return;
    await api.freezeCard(singleSelectedCard.card.id);
    await refresh();
  }

  /** The Dock's "Hide"/"Show" action (selectedCards row, Dock.tsx) — flips
   *  metadata.hidden on every selected Card at once via cardStore.editCard, same
   *  "writes straight through, no draft" pattern the "action"/"prompt" CardTypes'
   *  own calibration UI already uses (works on a Card regardless of savedToVault
   *  state). Deselects afterward only when hiding (not showing) *and* the reveal
   *  toggle is off — otherwise the Card vanishes from the Page immediately while
   *  still technically "selected", which would leave the Dock showing actions for
   *  something no longer visible. */
  function handleToggleHiddenSelected() {
    if (selectedPageCards.length === 0) return;
    const nextHidden = !selectedPageCards.every((pc) => pc.card.metadata.hidden);
    for (const pc of selectedPageCards) {
      editCard(pc.card.id, { metadata: { ...pc.card.metadata, hidden: nextHidden } });
    }
    if (nextHidden && !revealHidden) {
      deselectAll();
    }
  }

  /** Move's own "drop onto the Dock" destination for Page Cards (Dock.tsx's
   *  dockCardsAction, tapped while `moving`) — moves every selected Card off its
   *  Page and onto the Dock's persistent scratchpad, as one batch. Selection
   *  (selectedPageCardIds) stays populated throughout Move Mode (unlike Dock
   *  Card/embed Move — see handleEnterMoveMode), so this reads the same
   *  selectedPageCards a pre-Move-Mode "Move to Dock" tap would have. */
  async function handleMoveToDock() {
    if (selectedPageCards.length === 0) return;
    const cardIds = selectedPageCards.map((pc) => pc.card.id);
    const pageCardIds = selectedPageCards.map((pc) => pc.id);
    setMovingPageCardIds(new Set());
    deselectAll();
    // Sequential, not parallel — each call re-reads the Dock's own append order
    // fresh, same reasoning as handleDropDockCardAt's own batch move.
    for (const pageCardId of pageCardIds) {
      await api.movePageCardToDock(pageCardId);
    }
    await refresh();
    await dockCards.refresh();
    // Same reasoning as handleSaveSelected above — a plain REST call per Card.
    for (const cardId of cardIds) notifySaved(cardId);
  }

  /** The header's down-arrow (CardHeaderActions' onSendToDock) — the direct,
   *  one-Card replacement for Move Mode's own "drop onto Dock" (handleMoveToDock
   *  above): no Move Mode detour, just send this one Card straight there. The Dock
   *  holds as many Cards as added, so there's no occupied/disabled state to worry
   *  about here any more. */
  async function handleSendPageCardToDock(pageCardId: string) {
    const cardId = currentPage?.pageCards.find((pc) => pc.id === pageCardId)?.card.id;
    await api.movePageCardToDock(pageCardId);
    await refresh();
    await dockCards.refresh();
    if (cardId) notifySaved(cardId);
  }

  /** Adds a vault Card straight to the Dock's own list (Dock.tsx's vault-selected
   *  action) — the Card is simply rendered inline the moment it lands, no panel to
   *  open or navigate to any more. */
  async function handleAddVaultCardToDock(cardId: string) {
    await dockCards.addExistingCard(cardId);
  }

  /** The idle Dock row's own direct "Upload file" action (Dock.tsx's
   *  uploadDockFileAction) — same "just appears inline" behavior as
   *  handleAddVaultCardToDock above. */
  async function handleUploadFileToDock(file: File) {
    await dockCards.uploadFile(file);
  }

  /** The Dock's Convert menu, for a PDF/image/HTML/EPUB File Card (Dock.tsx's
   *  handleConvertFileCard) — extraction/OCR/AI-cleanup all land here once they
   *  produce a result: creates the new Card straight in the Dock (no preview step,
   *  per the "straight to the Dock" convert flow), which then just renders inline. */
  async function handleConvertedCardToDock(title: string, html: string) {
    await dockCards.createCard(title, html);
  }

  /** DockCardView's own header "X" (CardHeaderActions' onRemove, wired via
   *  Dock.tsx's onCloseDockCard) — same removal semantics as
   *  handleCloseSelectedDockCards above (deletes outright if never saved to the
   *  vault, unpins otherwise), just acting on the one explicit id directly rather
   *  than reading from selectedDockCardIds. */
  async function handleCloseDockCard(id: string) {
    await dockCards.removeDockCard(id);
  }

  /** DockCardView's own header up-arrow (CardHeaderActions' onSendToPage, wired via
   *  Dock.tsx's onSendDockCardToPage) — unlike handleEnterDockCardMoveMode's own
   *  "Move to Page" (still a deliberate Move Mode + drop-zone pick, for whoever
   *  wants an exact spot), this one-tap shortcut just lands the Card at the bottom
   *  of the current Page immediately — no destination to pick. */
  async function handleSendDockCardToPage(id: string) {
    if (!currentPage) return;
    await dockCards.moveToPage(id, currentPage.id, currentPage.pageCards.length);
    await refresh();
  }

  /** DockCardView's own header "+" (CardHeaderActions' onTurnIntoStack, wired via
   *  Dock.tsx's onTurnDockCardIntoStack) — same two-step shape as
   *  handleTurnIntoStackWithNewCard above (convert, then immediately add a second
   *  blank alternate), just against the DockCard's own cardId rather than a
   *  PageCard's. */
  async function handleTurnDockCardIntoStack(dockCardId: string) {
    const converted = await dockCards.convertToStack(dockCardId);
    await api.addStackMember(converted.card.id);
    await dockCards.refresh();
  }

  function handleEnterMoveMode() {
    if (selectedPageCardIds.size === 0 || !currentPage) return;
    setMovingPageCardIds(new Set(selectedPageCardIds));
    // Captured now, while `currentPage` is still the *source* Page — reaching a
    // different destination Page means navigating away first (there's no other way
    // to get there, see the page-nav cluster's own doc comment), at which point
    // `currentPage` is the destination and no longer has these ids to sort by at
    // all. handleDropAt reads this instead of re-deriving order from currentPage.
    setMovingPageCardOrder(
      currentPage.pageCards
        .filter((pc) => selectedPageCardIds.has(pc.id))
        .sort((a, b) => a.order - b.order)
        .map((pc) => pc.id),
    );
    // Selection carries forward (movingPageCardIds above), but editing doesn't —
    // without this, a Card whose type doesn't swap the Dock to the formatting
    // toolbar while editing (e.g. "action", see isEditingActive) could reach Move
    // mode while still rendering its own inline Editor underneath the drop zones.
    setEditingPageCardIds(new Set());
  }

  function handleCancelMove() {
    setMovingPageCardIds(new Set());
    setMovingPageCardOrder([]);
  }

  /** The Move Mode drop target (PageStack.tsx's DropZone) — moves the whole batch of
   *  `movingPageCardIds` to `destIndex` together, preserving their relative order
   *  (Step 6 spec §4.2's "batch-move together"). Sequential, not parallel: each
   *  movePageCard call re-reads sibling order fresh from the DB, so doing them one
   *  at a time (rather than racing several against the same stale snapshot) is what
   *  keeps the final order correct. Order comes from `movingPageCardOrder`, captured
   *  at handleEnterMoveMode time — see that state's own doc comment. */
  async function handleDropAt(destPageId: string, destIndex: number) {
    if (movingPageCardIds.size === 0) return;
    const ordered = movingPageCardOrder;
    const sameCurrentPage = destPageId === currentPage?.id;
    const movedCardIds = currentPage
      ? currentPage.pageCards.filter((pc) => movingPageCardIds.has(pc.id)).map((pc) => pc.card.id)
      : [];
    setMovingPageCardIds(new Set());
    setMovingPageCardOrder([]);
    deselectAll();
    const move = async () => {
      for (let i = 0; i < ordered.length; i++) {
        await api.movePageCard(ordered[i], destPageId, destIndex + i);
      }
      return refresh();
    };
    // A cross-Page move touches two Pages' own history logs (each HistoryEntry is
    // scoped to one pageId) — out of scope for this pass, so it just isn't recorded;
    // an in-Page reorder (the common case) records normally.
    if (sameCurrentPage) {
      await withHistory("edit", "Moved card", movedCardIds, move, true);
    } else {
      await move();
    }
  }

  // Draft edits fire on every keystroke (Card.tsx/richtext/CardRichText.tsx's
  // onChangeDraft). Two things could otherwise go wrong under fast typing, now that
  // CardRichText can have several independently-typeable text segments:
  //
  // 1. UI correctness: the content textarea is a *controlled* input, so React resets
  //    its DOM value back to `pages` state on every render. If nothing updated that
  //    state synchronously, any incidental re-render mid-keystroke (there's no
  //    shortage of causes in a tree this size) would silently erase whatever was
  //    typed since the last server round-trip landed — usePages' updateDraftLocally
  //    fixes this by patching state immediately, before the PATCH even goes out.
  // 2. DB correctness: overlapping PATCH requests for the same PageCard can be
  //    applied by the server out of order (a slow-to-land early keystroke's PATCH
  //    can overwrite a faster later one's). Coalescing per pageCardId guarantees at
  //    most one PATCH+refresh in flight per Card at a time: further edits that
  //    arrive while one is in flight get merged into `pending` and sent as a single
  //    follow-up request once it resolves, so writes reach the server in the order
  //    they were last known, never raced against each other.
  const draftInFlight = useRef<Set<string>>(new Set());
  const draftPending = useRef<Map<string, { title?: string; content?: string }>>(new Map());

  async function flushDraft(pageCardId: string) {
    const next = draftPending.current.get(pageCardId);
    if (!next) return;
    draftPending.current.delete(pageCardId);
    draftInFlight.current.add(pageCardId);
    try {
      await api.updatePageCardDraft(pageCardId, next);
      await refresh();
    } finally {
      draftInFlight.current.delete(pageCardId);
      if (draftPending.current.has(pageCardId)) {
        await flushDraft(pageCardId);
      }
    }
  }

  function handleChangeDraft(pageCardId: string, draft: { title?: string; content?: string }) {
    updateDraftLocally(pageCardId, draft);
    const merged = { ...draftPending.current.get(pageCardId), ...draft };
    draftPending.current.set(pageCardId, merged);
    if (!draftInFlight.current.has(pageCardId)) {
      flushDraft(pageCardId);
    }
  }

  /** The Vault panel's "new file" action (Dock.tsx's onCreateVaultCard) — creates the
   *  Card directly in the vault, rather than on the current Page (that's a separate,
   *  page-oriented action — the Dock's own "Add Card" button when a Page is
   *  selected). Untitled — a Card can have no title by default (see
   *  cardService.createCard's own doc comment), and shows as genuinely blank
   *  wherever its title is displayed, not a placeholder word standing in for it. */
  async function handleCreateVaultCard(): Promise<Card> {
    return vault.createCard("");
  }

  /** Opening a vault Card into the current Page can 500 if the panel's cached list
   *  is stale — e.g. the Card was deleted (the Vault panel's own per-Card delete
   *  action) from a different PageCard elsewhere since the list was last fetched, so
   *  this cardId no longer exists. Re-syncing the list on failure clears the dead
   *  entry instead of leaving it clickable (and failing the same way) indefinitely. */
  async function handleAddVaultCardToPage(cardId: string) {
    if (!currentPage) return;
    const before = snapshotWholePage(currentPage);
    try {
      await openCardIntoPage(currentPage.id, cardId);
      await history.record("edit", "Added card", [cardId], before, snapshotWholePage(await refresh()));
    } catch {
      await vault.refresh(vault.query || undefined);
    }
  }

  /** The Feed Input Button's Add action (Step 6 spec §2.2) — creates a Card straight
   *  from whatever's typed into the expanded text field, bypassing AI entirely; blank
   *  if the field was empty. `createCardInPage`'s own return (the new PageCard) is
   *  what identity-tags the recorded entry — see `withHistory`'s own doc comment for
   *  why this handler builds the entry directly instead: the new Card's id isn't
   *  known until *after* the mutation, unlike remove/move/turnIntoStack. */
  async function handleAddCardToCurrentPage(content: string) {
    if (!currentPage) return;
    const before = snapshotWholePage(currentPage);
    const pc = await createCardInPage(currentPage.id, "", content);
    await recordCardAdded(before, "Added card", pc);
  }

  // Lets the Dock's text-selection quick-lookup row (Dock.tsx's showLookupRow) add
  // its result to the current Page/Dock without needing a prop threaded down to
  // it — see quickAddRegistry.ts's doc comment. Re-registers on every relevant
  // change since these are plain overwritten closures, not something anything else
  // observes reactively.
  useEffect(() => {
    registerQuickAddHandlers({
      addToPage: async (html, title) => {
        if (currentPage) await createCardInPage(currentPage.id, title ?? "", html);
      },
      addToDock: async (html, title) => {
        await dockCards.createCard(title ?? "", html);
      },
    });
  }, [currentPage, createCardInPage, dockCards.createCard]);

  async function handleUploadFileToCurrentPage(file: File) {
    if (!currentPage) return;
    const before = snapshotWholePage(currentPage);
    const pc = await api.uploadFileToPage(currentPage.id, file);
    await recordCardAdded(before, "Added card", pc);
  }

  /** The Feed Input Button's type-picker "Prompt" option — plain addNewCardToPage
   *  (createCardInPage) with a metadata override, "select this type = create it
   *  right away". The picker's own vocabulary is deliberately restricted to
   *  Open/blank/Upload/JS/Prompt — see FeedInputButton.tsx's own typeOptions
   *  list ("Interactive" was dropped as redundant with JS, which can do
   *  everything a plain input Card did plus live logic). */
  async function handleAddPromptToCurrentPage() {
    if (!currentPage) return;
    const before = snapshotWholePage(currentPage);
    const pc = await createCardInPage(currentPage.id, "", "", {
      version: 1,
      typeId: "prompt",
      prompt: { input: "", iterations: [], activeIndex: 0, context: { mode: "none", cardIds: [] } },
    });
    await recordCardAdded(before, "Added card", pc);
  }

  /** The Feed Input Button's type-picker "JS" option — see
   *  handleAddPromptToCurrentPage above for the same reasoning. */
  async function handleAddJsToCurrentPage() {
    if (!currentPage) return;
    const before = snapshotWholePage(currentPage);
    const pc = await createCardInPage(currentPage.id, "", "", {
      version: 1,
      typeId: "js",
      js: { source: "" },
    });
    await recordCardAdded(before, "Added card", pc);
  }

  /** The Feed Input Button's "New Page" tile (Homes + Pages hierarchy, Phase 2) —
   *  "create from a page", the everyday way to grow: a new child Page under the
   *  current one, a link back to it left on the current Page, then straight there
   *  ("prefer open child" per the locked decisions). Not a CardType — no Card is
   *  created on *this* Page, so this doesn't go through createCardInPage the way
   *  every onAddX handler above does. */
  async function handleCreateChildPage() {
    if (!currentPageId) return;
    const child = await api.createChildPage(currentPageId);
    navigateToPage(child.id);
  }

  /** Search's own "Create Home" (Homes + Pages hierarchy, Phase 2) — deliberately
   *  only reachable from the Vault panel's own zero-match empty state
   *  (VaultView.tsx), not a standing button, per the plan's own "keep Create Home
   *  rare" risk note. "Create Home anything" — titled from whatever was searched. */
  async function handleCreateHome() {
    const home = await vault.createHome(vault.query || undefined);
    navigateToPage(home.id);
  }

  /** "Opening" a Template — instantiates a fresh copy server-side, then navigates
   *  straight to it. Reused by both an "action" Card's "openTemplate" job
   *  (handleRunActionJob below) and the Template browser's own Open button. Neither
   *  scope needs a destination Tab any more (see templateService.openTemplate) — it
   *  always lands on exactly one Page. */
  async function handleOpenTemplate(templateId: string) {
    const result = await api.openTemplate(templateId);
    navigateToPage(result.pageId, "down");
  }

  /** An inline actionButton node's click (ActionButtonNodeView.tsx) — dispatches to
   *  whichever of the small, fixed set of jobs (lib/actionJobs.ts) it's configured
   *  for. */
  async function handleRunActionJob(
    pageCard: PageCardWithCard,
    jobId: string | undefined,
    jobParams: Record<string, unknown> | undefined,
  ): Promise<StepOutput | void> {
    return await runActionJob(pageCard, jobId, jobParams, {
      onCreateCard: async (pc, title, content, pageId, typeId) => {
        const created = await createCardInPage(
          pageId ?? pc.pageId,
          title,
          content,
          typeId ? { version: 1, typeId } : undefined,
        );
        return { cardId: created.card.id, pageCardId: created.id };
      },
      onOpenTemplate: async (templateId) => {
        await handleOpenTemplate(templateId);
      },
      // Anchored at the Action Card's own PageCard — same "insert directly below,
      // context is everything above" placement every other card-level generation
      // uses (generationService.ts's GenerationTarget), just triggered by this
      // button instead of the Dock's Generate action. Auto-saves on completion,
      // same as every other generation in the app today (useGeneration.ts).
      // Awaitable (useGeneration.ts's startAndWait, Brilliantly Simple Generation
      // Agent plan) — a multi-step action's own run loop now waits for the
      // generation to actually land before moving on to whatever's next, rather
      // than firing the stream and immediately continuing as this job's original
      // behavior always did. No actionsDoc any more — interactive mode no longer
      // teaches a self-running action-card vocabulary (see interactive/system.md);
      // real mutation goes through the agent (handleRunAgentForPage) instead.
      onPromptCard: async (pc, instructions, contextMode) => {
        pendingGenerationRef.current = { cardIds: [pc.card.id], before: snapshotWholePage(currentPage) };
        return await generation.startAndWait(pc.id, instructions, contextMode === "own");
      },
      onNewBlankPage: async () => {
        await handleCreateNewPage();
      },
      onNewBlankTab: async () => {
        // "New blank Tab" and "new blank Page" collapse to the same action now —
        // Tab isn't a place any more (see schema.prisma's Tab doc comment).
        await handleCreateNewPage();
      },
      onNavigatePage: async (direction) => {
        if (direction === "up") navigateUp();
        else navigateDown();
      },
      onNavigateToPage: async (pageId) => {
        navigateToPage(pageId);
      },
      onRemoveCard: async (targetPageCardId) => {
        await api.removePageCardFromPage(targetPageCardId);
        await refresh();
      },
      onSaveCard: async (targetPageCardId) => {
        await api.savePageCardToVault(targetPageCardId);
        await refresh();
      },
    });
  }

  /** "Save as Template", scope "page" — the only scope creatable from the UI now
   *  (Tab is gone; a scope "tab"/hub Template can still be *opened*, just not newly
   *  authored — see templateService.buildSnapshotFromTab's doc comment). While
   *  editingTemplateId is set, this updates that same Template in place instead of
   *  opening the name/description modal — there's nothing new to ask for on a
   *  re-save. */
  async function handleSaveAsTemplateFromPage() {
    if (!currentPage) return;
    if (editingTemplateId) {
      await api.updateTemplateSnapshot(editingTemplateId, { pageId: currentPage.id });
      return;
    }
    setSaveAsTemplateRequest({ pageId: currentPage.id });
  }

  /** SaveAsTemplateModal's submit — only ever reached for a brand-new Template (see
   *  the editingTemplateId short-circuits above), so this always creates. */
  async function handleSubmitSaveAsTemplate(name: string, description: string) {
    if (!saveAsTemplateRequest) return;
    await api.createTemplate({ name, description: description || null, ...saveAsTemplateRequest });
    setSaveAsTemplateRequest(null);
  }

  /** The Template browser's Open action — also reachable from an "action" Card's
   *  "openTemplate" job (handleRunActionJob above), both via handleOpenTemplate. */
  function handleOpenTemplateFromBrowser(template: Template) {
    setTemplateBrowserOpen(false);
    void handleOpenTemplate(template.id);
  }

  /** The Template browser's Edit action — opens a live copy exactly like Open does,
   *  but also sets editingTemplateId/Name so a later "Save as Template" updates
   *  this Template instead of creating a new one. Never offered for isCore
   *  Templates (TemplateBrowser.tsx hides the button; templateService.ts rejects it
   *  server-side too). */
  function handleEditTemplateFromBrowser(template: Template) {
    setTemplateBrowserOpen(false);
    setEditingTemplateId(template.id);
    setEditingTemplateName(template.name);
    void handleOpenTemplate(template.id);
  }

  function handleStopEditingTemplate() {
    setEditingTemplateId(null);
    setEditingTemplateName(null);
  }

  /** Removes one Card from the Page — each CardType's own header "X"
   *  (Card design pass: CardHeaderActions' onRemove, threaded through PageStack's
   *  onRemovePageCard) calls this directly; there's no separate Dock bulk-remove
   *  any more. A Stack Card closes as a whole (stackService.closeStack, promoting
   *  any unsaved member to the vault first) since "remove" doesn't mean anything
   *  at the per-alternate level; anything else just detaches from the Page, vault
   *  Card untouched (pageCardService.removeFromPage). */
  async function handleRequestRemovePageCard(pageCardId: string) {
    const pageCard = currentPage?.pageCards.find((pc) => pc.id === pageCardId);
    if (!pageCard) return;
    if (focusedPageCardId === pageCardId) setFocusedPageCardId(null);
    await withHistory(
      "edit",
      "Removed card",
      [pageCard.card.id],
      async () => {
        if (getCardTypeId(pageCard.card) === "stack") {
          await api.closeStack(pageCard.card.id);
        } else {
          await api.removePageCardFromPage(pageCardId);
        }
        return refresh();
      },
      true,
    );
  }

  /** The Dock's merged page-nav "+" control, repurposed while moving (see the
   *  onAddPage prop below): creates a new loose Page, navigates to it, then
   *  immediately drops the moving Card there as its first Card. */
  async function handleDropOnNewPage() {
    if (movingPageCardIds.size === 0) return;
    const page = await api.createPage();
    navigateToPage(page.id, "down");
    await handleDropAt(page.id, 0);
  }

  /** Same as handleDropOnNewPage above, for a Dock Card Move in progress instead of
   *  a Page Card one. */
  async function handleDockCardDropOnNewPage() {
    if (movingDockCardIds.size === 0) return;
    const page = await api.createPage();
    navigateToPage(page.id, "down");
    await handleDropDockCardAt(page.id, 0);
  }

  /** Same as handleDropOnNewPage above, for an embed Move in progress instead of a
   *  Page Card one. */
  async function handleEmbedDropOnNewPage() {
    if (!movingEmbedCard) return;
    const page = await api.createPage();
    navigateToPage(page.id, "down");
    await handleDropEmbedAt(page.id, 0);
  }

  // The optional sibling trail's own position (Phase 3) — 0 for a loose Page with no
  // siblingGroupId, same as PageStackEdges' old "how deep in the stack" reading.
  const pagesAboveCount = siblings.index === -1 ? 0 : siblings.index;

  // Mutually exclusive with the normal Page view below — takes over the same flex
  // slot in .app (Dock stays put underneath either one) rather than overlaying on
  // top of it, so there's no z-index/stacking to manage.
  const focusedOverlay = focusedPage && (
    <div className="fullscreen-card">
      <button
        type="button"
        className="fullscreen-card__back"
        aria-label={t("dock.action.back")}
        title={t("dock.action.back")}
        onClick={() => setFocusedPageCardId(null)}
      >
        <Icon name="back" />
      </button>
      <div className="fullscreen-card__body">
        <PageStack
          currentPage={focusedPage}
          ancestors={EMPTY_PAGE_SUMMARIES}
          onOpenAncestor={NOOP_ID}
          direction={null}
          revealHidden={revealHidden}
          selectedPageCardIds={selectedPageCardIds}
          editingPageCardIds={editingPageCardIds}
          onTogglePageCard={toggleSelectPageCard}
          onCloseEditor={exitEditPageCard}
          onRequestEditPageCard={requestEditPageCard}
          onActivatePageCardEditor={activatePageCardEditor}
          onRemovePageCard={handleRequestRemovePageCard}
          onChangeDraft={handleChangeDraft}
          selectedEmbedIds={selectedEmbedIdSet}
          onSelectEmbed={selectEmbed}
          onRequestEditEmbed={requestEditEmbed}
          editingEmbedIds={editingEmbedIds}
          onToggleEmbedEdit={toggleEditEmbed}
          onRunProcess={handleRunProcess}
          onCreateManualHighlight={handleCreateManualHighlight}
          onAcceptDiff={handleAcceptDiff}
          onRemoveAnnotation={handleRemoveAnnotation}
          onUpdateAnnotationText={handleUpdateAnnotationText}
          onRunActionJob={handleRunActionJob}
          generatingPageCardId={
            generation.isStreaming && generation.target?.type === "card" ? generation.target.pageCardId : null
          }
          onTurnIntoStack={handleTurnIntoStackWithNewCard}
          onSendToDock={handleSendPageCardToDock}
          onRecordEditHistory={handleRecordEditHistory}
          movingPageCardIds={EMPTY_ID_SET}
          onDropAt={NOOP_INDEX}
          dockCardMoving={false}
          onDropDockCardAt={NOOP_INDEX}
          embedMoving={false}
          onDropEmbedAt={NOOP_INDEX}
          ghostCard={null}
          feedInput={null}
        />
      </div>
    </div>
  );

  // Same "takes over the same flex slot, Dock stays put underneath" treatment as
  // focusedOverlay above — mutually exclusive with it in practice (opening Homes
  // clears focusedPageCardId, see onOpenHomesPage below) rather than by construction,
  // since they're independent bits of state.
  const homesOverlay = homesPageOpen ? (
    <div className="fullscreen-card">
      <button
        type="button"
        className="fullscreen-card__back"
        aria-label={t("dock.action.back")}
        title={t("dock.action.back")}
        onClick={() => setHomesPageOpen(false)}
      >
        <Icon name="back" />
      </button>
      <div className="fullscreen-card__body">
        <HomesPanel
          homes={vault.homes}
          currentPageId={currentPageId}
          onOpenPage={(id) => {
            navigateToPage(id);
            setHomesPageOpen(false);
          }}
          onCreateHome={() => {
            handleCreateHome();
            setHomesPageOpen(false);
          }}
        />
      </div>
    </div>
  ) : null;

  return (
    <div className="app">
      {focusedOverlay ?? homesOverlay ?? (
      <div className="page-viewport">
        <PageStackEdges above={pagesAboveCount} />
        <main className="app__main">
          <PageStack
            currentPage={currentPage}
            onRenameTitle={handleRenamePage}
            ancestors={ancestors}
            onOpenAncestor={navigateToPage}
            direction={navDirection}
            revealHidden={revealHidden}
            selectedPageCardIds={selectedPageCardIds}
            editingPageCardIds={editingPageCardIds}
            onTogglePageCard={toggleSelectPageCard}
            onCloseEditor={exitEditPageCard}
            onRequestEditPageCard={requestEditPageCard}
            onActivatePageCardEditor={activatePageCardEditor}
            onRemovePageCard={handleRequestRemovePageCard}
            onChangeDraft={handleChangeDraft}
            selectedEmbedIds={selectedEmbedIdSet}
            onSelectEmbed={selectEmbed}
            onRequestEditEmbed={requestEditEmbed}
            editingEmbedIds={editingEmbedIds}
            onToggleEmbedEdit={toggleEditEmbed}
            onRunProcess={handleRunProcess}
            onCreateManualHighlight={handleCreateManualHighlight}
            onAcceptDiff={handleAcceptDiff}
            onRemoveAnnotation={handleRemoveAnnotation}
            onUpdateAnnotationText={handleUpdateAnnotationText}
            onRunActionJob={handleRunActionJob}
            generatingPageCardId={
              generation.isStreaming && generation.target?.type === "card" ? generation.target.pageCardId : null
            }
            onTurnIntoStack={handleTurnIntoStackWithNewCard}
            onSendToDock={handleSendPageCardToDock}
            onRecordEditHistory={handleRecordEditHistory}
            movingPageCardIds={movingPageCardIds}
            onDropAt={(index) => handleDropAt(currentPage!.id, index)}
            dockCardMoving={movingDockCardIds.size > 0}
            onDropDockCardAt={(index) => handleDropDockCardAt(currentPage!.id, index)}
            embedMoving={movingEmbedCard !== null}
            onDropEmbedAt={(index) => handleDropEmbedAt(currentPage!.id, index)}
            ghostCard={
              generation.rootId !== null && generation.target
                ? {
                    afterPageCardId:
                      generation.target.type === "card" ? generation.target.pageCardId : null,
                    rootId: generation.rootId,
                    nodes: generation.nodes,
                  }
                : null
            }
            feedInput={
              currentPage
                ? {
                    generating: generation.isStreaming || agentRunning,
                    onStopGeneration: handleStopGeneration,
                    onGenerate: handleGeneratePage,
                    onAddCard: handleAddCardToCurrentPage,
                    onOpenVault: () => setOpenPanel("vault"),
                    onCreateChildPage: handleCreateChildPage,
                    onUploadFile: handleUploadFileToCurrentPage,
                    onAddPrompt: handleAddPromptToCurrentPage,
                    onAddJs: handleAddJsToCurrentPage,
                  }
                : null
            }
          />
        </main>
      </div>
      )}

      <Dock
        selectedCards={selectedPageCards}
        currentPage={currentPage}
        onRunActionJob={handleRunActionJob}
        selectedEmbedIds={selectedEmbedIdSet}
        selectedEmbedId={selectedPageCards.length === 0 ? singleSelectedEmbed?.cardId ?? null : null}
        selectedEmbedCard={selectedPageCards.length === 0 ? selectedEmbedCard ?? null : null}
        isEditingActive={isEditingActive}
        onExitEditing={exitEditing}
        onAddEmbedToPage={handleAddEmbedToPage}
        onFreezeEmbed={handleFreezeEmbed}
        onToggleHiddenEmbed={handleToggleHiddenEmbed}
        generationError={generation.error ?? agentError}
        onDismissGenerationError={() => {
          generation.dismissError();
          setAgentError(null);
        }}
        generationNotice={generation.notice ?? agentNotice}
        onDismissGenerationNotice={() => {
          generation.dismissNotice();
          setAgentNotice(null);
        }}
        annotationError={annotations.error}
        onDismissAnnotationError={annotations.dismissError}
        onFreezeSelected={handleFreezeSelected}
        onToggleHiddenSelected={handleToggleHiddenSelected}
        pendingDiffCount={pendingDiffCount}
        onAcceptAllDiffs={
          dockAnnotationCardId
            ? () => {
                console.debug("[annot] Dock onAcceptAllDiffs fired", {
                  dockAnnotationCardId,
                  dockAnnotationPageCardId,
                });
                handleAcceptAllDiffs(dockAnnotationCardId, dockAnnotationPageCardId);
              }
            : null
        }
        onMoveToDock={handleMoveToDock}
        moving={movingPageCardIds.size > 0}
        onEnterMoveMode={handleEnterMoveMode}
        onCancelMove={handleCancelMove}
        dockCardMoving={movingDockCardIds.size > 0}
        onCancelDockCardMove={handleCancelDockCardMove}
        embedMoving={movingEmbedCard !== null}
        onEnterEmbedMoveMode={handleEnterEmbedMoveMode}
        onCancelEmbedMove={handleCancelEmbedMove}
        onMoveEmbedToDock={handleMoveEmbedToDock}
        onDeselectEmbed={handleDeselectEmbed}
        openPanel={openPanel}
        onOpenPanel={setOpenPanel}
        onClosePanel={() => setOpenPanel(null)}
        revealHidden={revealHidden}
        onToggleRevealHidden={() => setRevealHidden((r) => !r)}
        vaultSearchResults={vault.cards}
        vaultQuery={vault.query}
        onVaultQueryChange={vault.setQuery}
        onCreateVaultCard={handleCreateVaultCard}
        onUploadVaultFile={vault.uploadFile}
        onRenameVaultCard={vault.renameCard}
        onDeleteVaultCard={vault.deleteCard}
        onAddVaultCardToPage={currentPage ? handleAddVaultCardToPage : null}
        onAddVaultCardToDock={handleAddVaultCardToDock}
        onUploadFileToDock={handleUploadFileToDock}
        onConvertedCardToDock={handleConvertedCardToDock}
        dockCards={dockCards.dockCards}
        editingDockCardIds={editingEmbedIds}
        onToggleDockCardEdit={toggleEditEmbed}
        onCreateDockCard={dockCards.createCard}
        onUploadDockCardFile={dockCards.uploadFile}
        selectedDockCardIds={selectedDockCardIds}
        onToggleSelectDockCard={toggleSelectDockCard}
        onDeselectDockCards={deselectDockCards}
        onCloseSelectedDockCards={handleCloseSelectedDockCards}
        onMoveSelectedDockCardsToPage={handleEnterDockCardMoveMode}
        onSendDockCardToPage={handleSendDockCardToPage}
        onCloseDockCard={handleCloseDockCard}
        onTurnDockCardIntoStack={handleTurnDockCardIntoStack}
        dockCardGenerating={dockCardGeneration.isStreaming}
        dockCardGenerationNodes={dockCardGeneration.nodes}
        dockCardGenerationRootId={dockCardGeneration.rootId}
        onGenerateDockCard={dockCardGeneration.startForDockCard}
        onStopDockCardGeneration={dockCardGeneration.stop}
        siblingIndex={siblings.index}
        siblingCount={siblings.siblings.length}
        canNavigateUp={canNavigateUp}
        canNavigateDown={canNavigateDown}
        onNavigateUp={navigateUp}
        onNavigateDown={navigateDown}
        canGoBack={pageHistory.length > 0}
        canGoForward={pageForwardHistory.length > 0}
        onGoBack={goBack}
        onGoForward={goForward}
        onAddPage={
          movingPageCardIds.size > 0
            ? handleDropOnNewPage
            : movingDockCardIds.size > 0
              ? handleDockCardDropOnNewPage
              : movingEmbedCard !== null
                ? handleEmbedDropOnNewPage
                : handleCreateNewPage
        }
        homePageId={pagesNav.homePageId}
        currentPageId={currentPageId}
        onGoHome={handleGoHome}
        pinnedPages={pagesNav.pinned}
        isCurrentPagePinned={isCurrentPagePinned}
        onTogglePinCurrent={handleTogglePinCurrent}
        onOpenPage={(id) => navigateToPage(id)}
        vaultPageResults={vault.pages}
        onOpenPageFromSearch={(id) => navigateToPage(id)}
        vaultHomes={vault.homes}
        onCreateHome={handleCreateHome}
        onOpenHomesPage={() => {
          setFocusedPageCardId(null);
          setHomesPageOpen(true);
        }}
        onSaveAsTemplateFromPage={handleSaveAsTemplateFromPage}
        editingTemplateName={editingTemplateName}
        onStopEditingTemplate={handleStopEditingTemplate}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        canVersionBack={history.canGoBack}
        canVersionForward={history.canGoForward}
        onVersionBack={history.goBack}
        onVersionForward={history.goForward}
      />
      {saveAsTemplateRequest && (
        <SaveAsTemplateModal onSubmit={handleSubmitSaveAsTemplate} onClose={() => setSaveAsTemplateRequest(null)} />
      )}
      {templateBrowserOpen && (
        <TemplateBrowser
          onOpen={handleOpenTemplateFromBrowser}
          onEdit={handleEditTemplateFromBrowser}
          onClose={() => setTemplateBrowserOpen(false)}
        />
      )}
    </div>
  );
}

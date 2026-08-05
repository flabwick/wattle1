import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { App as WattleApp, Card, PageCardWithCard } from "@wattle/shared";
import type { AnnotationProcess } from "./api/client.js";
import { Dock } from "./components/Dock/Dock.js";
import { Icon } from "./components/primitives/index.js";
import type { DockPanel } from "./components/Dock/Dock.js";
import { PageStack } from "./components/PageStack/PageStack.js";
import { PageStackEdges } from "./components/PageStack/PageStackEdges.js";
import { SaveAsAppModal } from "./components/Apps/SaveAsAppModal.js";
import { AppBrowser } from "./components/Apps/AppBrowser.js";
import * as api from "./api/client.js";
import { usePages } from "./hooks/usePages.js";
import { useVault } from "./hooks/useVault.js";
import { useDockCards } from "./hooks/useDockCards.js";
import { useNearby } from "./hooks/useNearby.js";
import { useTabs } from "./hooks/useTabs.js";
import { useGeneration } from "./hooks/useGeneration.js";
import { useAnnotations } from "./hooks/useAnnotations.js";
import { editCard, getCachedCard, notifySaved, subscribeToCard } from "./lib/cardStore.js";
import { registerQuickAddHandlers } from "./lib/quickAddRegistry.js";
import { getCardTypeId } from "./lib/getCardTypeId.js";
import { runActionJob } from "./lib/actionJobs.js";
import { t } from "./i18n/index.js";

/** Move Mode never applies inside the fullscreen single-Card view (App.tsx's
 *  focusedPageCardId) — shared, stable references so that <PageStack>'s "not
 *  moving" props there don't churn on every render. */
const EMPTY_ID_SET: ReadonlySet<string> = new Set();
const NOOP_INDEX = (_index: number) => {};

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
   *  navigateToIndex's deselectAll() call, so it persists across Page navigation (see
   *  PageStack.tsx/Dock.tsx) — moot in practice once Selection Lock (§4.3) is wired
   *  up, since Page navigation is disabled the whole time anything's selected anyway. */
  const [movingPageCardIds, setMovingPageCardIds] = useState<Set<string>>(new Set());
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
  /** Set right after a Card lands in the Dock (moved from a Page, or added straight
   *  from the Vault — see handleMoveToDock/handleAddVaultCardToDock) to the new
   *  DockCard's own id — DockCardsPanel.tsx's openCardId prop picks this up and
   *  jumps straight to it, clearing this back to null once it has (onOpenedDockCard
   *  below), so it doesn't keep forcing that navigation on every later render. */
  const [dockCardToOpen, setDockCardToOpen] = useState<string | null>(null);
  /** Which extended panel (Step 6 spec §3.2) is open — Vault, Dock Cards, Pages, or
   *  Tabs, never more than one at once. Lifted here so the Dock's own toggles and the
   *  Feed Input Button's "Open" action can all reach it. */
  const [openPanel, setOpenPanel] = useState<DockPanel | null>(null);
  /** The Dock's "reveal hidden cards" toggle (Apps feature spec §2) — purely a
   *  display preference for the current Page, not tied to any one Card/Tab, so it
   *  isn't reset on navigation. */
  const [revealHidden, setRevealHidden] = useState(false);
  /** Apps feature spec §5's editingAppId — set only by the App browser's Edit
   *  action, cleared by tapping the Dock's own badge (onStopEditingApp). Paired with
   *  its name (not just the id) so the badge doesn't need an extra fetch. */
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editingAppName, setEditingAppName] = useState<string | null>(null);
  /** Non-null while the "Save as App" modal is open — snapshots which Tab/Page it
   *  was triggered from at that moment, not read live from currentTabId/currentPage,
   *  so navigating away while the modal is still open can't change the target. */
  const [saveAsAppRequest, setSaveAsAppRequest] = useState<{ tabId?: string; pageId?: string } | null>(null);
  const [appBrowserOpen, setAppBrowserOpen] = useState(false);
  /** Which Tab is currently in view (Step 6 spec §1.1) — null only during the brief
   *  window before the bootstrap effect below picks or creates one. */
  const [currentTabId, setCurrentTabId] = useState<string | null>(null);

  const tabs = useTabs();
  const {
    pages,
    addPage,
    createCardInPage,
    openCardIntoPage,
    refresh,
    uploadFileToPage,
    updateDraftLocally,
  } = usePages(currentTabId);
  const vault = useVault();
  const dockCards = useDockCards();

  const sortedTabs = useMemo(() => [...tabs.tabs].sort((a, b) => a.order - b.order), [tabs.tabs]);
  const currentTabIndex = sortedTabs.findIndex((tb) => tb.id === currentTabId);

  // Keep currentTabId pointing at a real Tab: defaults to the leftmost on first load,
  // re-settles there if the Tab it was on gets deleted out from under it, and — since
  // there must always be somewhere for Pages to live — creates a fresh one the moment
  // the list would otherwise be empty (a new install, or the last Tab just got deleted).
  useEffect(() => {
    if (tabs.loading) return;
    if (sortedTabs.some((tb) => tb.id === currentTabId)) return;
    if (sortedTabs.length > 0) {
      setCurrentTabId(sortedTabs[0].id);
    } else {
      tabs.createTab().then((tab) => setCurrentTabId(tab.id));
    }
  }, [tabs.loading, sortedTabs, currentTabId, tabs.createTab]);

  /** Jumps to `sortedTabs[index]` — the Tabs panel's click target and the swipe
   *  gesture's (below) resolved action. currentPageId's own bootstrap effect further
   *  down re-settles onto that Tab's own Pages once they've loaded; no-op at the
   *  edges (no wraparound) or if already on that Tab. */
  function switchToTabIndex(index: number) {
    // Selection Lock (Step 6 spec §4.3) — the Tabs panel is already unreachable
    // while a Card's selected (Dock.tsx hides its toggle then), but guard here too
    // as the one shared choke point every route into switching Tabs goes through.
    if (selectedPageCardIds.size > 0) return;
    const target = sortedTabs[index];
    if (!target || target.id === currentTabId) return;
    setCurrentTabId(target.id);
    deselectAll();
  }

  /** Swiping the main page content left/right switches Tabs (Step 6 spec §3.4) —
   *  Pointer Events cover touch, mouse, and pen in one set of handlers, on both
   *  mobile and desktop. Tracks the pointerdown origin and resolves the gesture on
   *  pointerup, rather than dragging anything live, so it can't fight PageStack's own
   *  per-Card tap/long-press/selection handling, and is easy to disable outright
   *  while a panel is open or a Card is mid-Move.
   *  Skips the Dock (its own horizontal scroll rows shouldn't trigger this) and any
   *  editable element (a horizontal text-selection drag inside a Card shouldn't
   *  either). */
  const swipeStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const SWIPE_THRESHOLD_PX = 60;

  function handleSwipeAreaPointerDown(e: ReactPointerEvent) {
    // Selection Lock (Step 6 spec §4.3): swiping between Tabs is disabled the whole
    // time one or more Cards are selected — the user has to deselect first.
    if (movingPageCardIds.size > 0 || openPanel || selectedPageCardIds.size > 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".dock") || target.closest("input, textarea, [contenteditable]")) return;
    swipeStart.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  }

  function handleSwipeAreaPointerUp(e: ReactPointerEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || start.pointerId !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    switchToTabIndex(currentTabIndex + (dx < 0 ? 1 : -1));
  }

  function handleSwipeAreaPointerCancel() {
    swipeStart.current = null;
  }

  // Auto-saves the moment a generation lands (cleanly or via Stop) — no separate
  // review step. `refresh` re-fetches `pages` so the newly-saved Card shows up;
  // useGeneration.ts awaits this before clearing its own ghost-card state, so there's
  // no flash of "nothing there" in between.
  const generation = useGeneration(refresh);
  const annotations = useAnnotations();

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

  const sortedPages = useMemo(() => [...pages].sort((a, b) => b.order - a.order), [pages]);

  // Keep currentPageId pointing at a real Page: defaults to the top of the stack on
  // first load, and re-settles there if the Page it was on gets deleted out from
  // under it.
  useEffect(() => {
    if (!sortedPages.some((p) => p.id === currentPageId)) {
      setCurrentPageId(sortedPages[0]?.id ?? null);
    }
  }, [sortedPages, currentPageId]);

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

  /** Only ever meaningful when exactly one embed is selected (singleSelectedEmbed) —
   *  Dock.tsx's own single-embed action row gates on that the same way. */
  function handleRemoveEmbed() {
    if (!singleSelectedEmbed) return;
    singleSelectedEmbed.onRemove();
    deselectOneEmbed(singleSelectedEmbed.cardId);
  }

  // Deletes the embedded Card from the vault entirely (same global delete the Vault
  // panel uses — vault.deleteCard), then strips the now-dangling token out of this
  // particular parent too, rather than leaving CardEmbed's "not found" fallback
  // showing indefinitely where the user was just looking. Only ever meaningful when
  // exactly one embed is selected (singleSelectedEmbed) — same gating as above.
  async function handleDeleteEmbed() {
    if (!singleSelectedEmbed) return;
    const { cardId, onRemove } = singleSelectedEmbed;
    deselectOneEmbed(cardId);
    onRemove();
    await vault.deleteCard(cardId);
    await refresh();
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
    const dockCard = await dockCards.addExistingCard(cardId);
    onRemove();
    setOpenPanel("dockCards");
    setDockCardToOpen(dockCard.id);
  }

  const currentPageIndex = sortedPages.findIndex((p) => p.id === currentPageId);
  const currentPage = currentPageIndex === -1 ? null : sortedPages[currentPageIndex];

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
  async function handleTurnIntoStackWithNewCard(pageCardId: string) {
    const converted = await api.convertCardToStack(pageCardId);
    await api.addStackMember(converted.card.id);
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

  // Selection Lock (Step 6 spec §4.3): Page navigation arrows are disabled the whole
  // time one or more Cards are selected — the user has to deselect first. Move Mode
  // is deliberately exempt: it carries the selection forward (handleEnterMoveMode),
  // but moving a Card to a *different* Page (§4.2) has always worked by navigating
  // there first and dropping at a zone on the newly-viewed Page — locking navigation
  // during Move Mode too would make that destination unreachable entirely.
  const navigationLocked = selectedPageCardIds.size > 0 && movingPageCardIds.size === 0;
  const canNavigateUp = !navigationLocked && currentPageIndex > 0;
  const canNavigateDown = !navigationLocked && currentPageIndex !== -1 && currentPageIndex < sortedPages.length - 1;

  /** Which way the Page transition animation should play (PageStack.tsx) — "up"
   *  slides the new Page in from below (moving toward the top of the stack, index
   *  decreasing), "down" from above. Set right before the Page actually changes so
   *  PageStack's remount (keyed on the new Page's id) picks up the right direction
   *  class on first paint. */
  const [navDirection, setNavDirection] = useState<"up" | "down" | null>(null);

  /** Jumps straight to any Page by its position in `sortedPages` — used by both
   *  arrow navigation and the Pages panel's jump action, so there's one place that
   *  derives the animation direction and resets selection/refreshes. */
  function navigateToIndex(index: number) {
    // Selection Lock (Step 6 spec §4.3): blocks every avenue into Page navigation at
    // this one shared choke point — the up/down arrows (already disabled via
    // canNavigateUp/Down above) and the Pages panel's own jump action both route
    // through here. Move Mode is exempt — see navigationLocked's doc comment.
    if (selectedPageCardIds.size > 0 && movingPageCardIds.size === 0) return;
    const target = sortedPages[index];
    if (!target || target.id === currentPageId) return;
    setNavDirection(index < currentPageIndex ? "up" : "down");
    setCurrentPageId(target.id);
    deselectAll();
    refresh();
  }

  function navigateUp() {
    if (!canNavigateUp) return;
    navigateToIndex(currentPageIndex - 1);
  }

  function navigateDown() {
    if (!canNavigateDown) return;
    navigateToIndex(currentPageIndex + 1);
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

  // Nearby's live rank (Wattle vault plan) — re-scored against the current Page's
  // open Cards plus whatever's actually being typed right now, if anything is being
  // edited. Only fetches while the Nearby panel is actually open (useNearby.ts).
  const nearbyFocusedCard = editingPageCard ?? singleSelectedCard;
  const nearbyDraftText = editingPageCard
    ? `${editingPageCard.draftTitle ?? editingPageCard.card.title}\n${
        editingPageCard.draftContent ?? editingPageCard.card.content
      }`
    : "";
  const nearby = useNearby(currentPage?.id ?? null, nearbyFocusedCard?.card.id ?? null, nearbyDraftText, openPanel === "nearby");

  async function handleOpenNearbyCard(cardId: string) {
    if (!currentPage) return;
    await openCardIntoPage(currentPage.id, cardId);
  }

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
    generation.startForPage(currentPage.id, instruction);
  }

  /** The Dock's magic button when a single plain (non-Stack) Card is selected
   *  (Dock.tsx's rewriteBoxOpen flow) — no longer inserts a new sibling Card the way
   *  every other generation in the app does. Instead this redoes the Card's own
   *  content in place: an instructed "diff" annotation run (annotationService.ts's
   *  broader system-instructed.md prompt, threaded through as `instruction`) whose
   *  proposed edits land as ordinary pending diffs, reviewed via the same
   *  accept/accept-all UI every other diff run already uses — never a freestanding
   *  new Card. A blank instruction (the box left empty) falls back to "diff"'s
   *  original narrow proofread-only behavior. A selected Stack keeps its own
   *  separate "append a new alternate" generation (Dock.tsx's isStackSelected),
   *  untouched by this. */
  function handleRewriteSelected(instruction: string) {
    if (!singleSelectedCard) return;
    handleRunProcess(
      singleSelectedCard.card.id,
      "diff",
      undefined,
      singleSelectedCard.id,
      instruction.trim() || undefined,
    );
  }

  async function handleFreezeSelected() {
    if (!singleSelectedCard) return;
    await api.freezeCard(singleSelectedCard.card.id);
    await refresh();
  }

  /** Saves every selected Card that has something pending to the vault — a no-op for
   *  any that don't (Step 6 spec §4.2's batched Save). */
  async function handleSaveSelected() {
    // Same title-required filter as Dock.tsx's own hasUnsavedDraft — a still-untitled
    // Card just isn't eligible to save yet, rather than erroring against
    // pageCardService.saveToVault's guard.
    const toSave = selectedPageCards.filter(
      (pc) =>
        (pc.draftTitle !== null || pc.draftContent !== null || !pc.card.savedToVault) &&
        (pc.draftTitle ?? pc.card.title).trim() !== "",
    );
    if (toSave.length === 0) return;
    await Promise.all(toSave.map((pc) => api.savePageCardToVault(pc.id)));
    // Same reasoning as the old single-Card handleSave: a plain REST call per Card,
    // not routed through cardStore, so notifySaved tells the Vault panel about each
    // one directly rather than relying on subscribeToSaves to fire on its own.
    for (const pc of toSave) notifySaved(pc.card.id);
    await refresh();
  }

  /** Card.tsx's own header Save button — same save-a-not-yet-vaulted-draft flow as
   *  handleSaveSelected above (same title-required guard too), just for one
   *  specific PageCard regardless of whether it's currently selected — a note's
   *  header always shows this while it has something pending, independent of the
   *  Dock's own batch Save (still reachable for a selection of several Cards at
   *  once via the Dock, unaffected by this). */
  async function handleSavePageCard(pageCardId: string) {
    const pc = currentPage?.pageCards.find((p) => p.id === pageCardId);
    if (!pc) return;
    if ((pc.draftTitle ?? pc.card.title).trim() === "") return;
    await api.savePageCardToVault(pageCardId);
    notifySaved(pc.card.id);
    await refresh();
  }

  /** Card.tsx's header button once there's nothing left to save (the tick state) —
   *  opens the Vault panel and searches for this Card by its own title
   *  (cardService.listCards' title/content substring match), the closest thing to
   *  "jump straight to this Card" the Vault has today, since it's a flat search or
   *  a folder browse rather than anything keyed by id. Good enough for a title
   *  that's actually somewhat distinctive; a very generic or duplicate title may
   *  surface more than just this one Card among the results. */
  function handleOpenCardInVault(title: string) {
    setOpenPanel("vault");
    vault.setQuery(title);
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
    const results = await Promise.all(pageCardIds.map((id) => api.movePageCardToDock(id)));
    await refresh();
    await dockCards.refresh();
    // Same reasoning as handleSaveSelected above — a plain REST call per Card.
    for (const cardId of cardIds) notifySaved(cardId);
    // Land on whichever one moved last (Step 6 feedback: moving a Card to the Dock
    // should open the Dock Cards panel straight onto it, not leave it to be found).
    const lastDockCard = results[results.length - 1];
    if (lastDockCard) {
      setOpenPanel("dockCards");
      setDockCardToOpen(lastDockCard.id);
    }
  }

  /** The Dock Cards toggle's own repurposed behavior while a vault Card is selected
   *  (Dock.tsx's dockCardsAction) — adds it to the Dock's persistent scratchpad,
   *  then opens the Dock Cards panel navigated straight to it, same
   *  land-on-the-new-Card behavior as handleMoveToDock above, instead of the
   *  toggle's normal open/close behavior. */
  async function handleAddVaultCardToDock(cardId: string) {
    const dockCard = await dockCards.addExistingCard(cardId);
    setOpenPanel("dockCards");
    setDockCardToOpen(dockCard.id);
  }

  function handleEnterMoveMode() {
    if (selectedPageCardIds.size === 0) return;
    setMovingPageCardIds(new Set(selectedPageCardIds));
    // Selection carries forward (movingPageCardIds above), but editing doesn't —
    // without this, a Card whose type doesn't swap the Dock to the formatting
    // toolbar while editing (e.g. "action", see isEditingActive) could reach Move
    // mode while still rendering its own inline Editor underneath the drop zones.
    setEditingPageCardIds(new Set());
  }

  function handleCancelMove() {
    setMovingPageCardIds(new Set());
  }

  /** The Move Mode drop target (PageStack.tsx's DropZone) — moves the whole batch of
   *  `movingPageCardIds` to `destIndex` together, preserving their relative order
   *  (Step 6 spec §4.2's "batch-move together"). Sequential, not parallel: each
   *  movePageCard call re-reads sibling order fresh from the DB, so doing them one
   *  at a time (rather than racing several against the same stale snapshot) is what
   *  keeps the final order correct. */
  async function handleDropAt(destPageId: string, destIndex: number) {
    if (movingPageCardIds.size === 0) return;
    const ordered = pages
      .flatMap((p) => p.pageCards.map((pc) => ({ pc, pageOrder: p.order })))
      .filter(({ pc }) => movingPageCardIds.has(pc.id))
      .sort((a, b) => a.pageOrder - b.pageOrder || a.pc.order - b.pc.order)
      .map(({ pc }) => pc.id);
    setMovingPageCardIds(new Set());
    deselectAll();
    for (let i = 0; i < ordered.length; i++) {
      await api.movePageCard(ordered[i], destPageId, destIndex + i);
    }
    await refresh();
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
   *  Card directly in the vault, in whichever Folder is currently browsed, rather
   *  than on the current Page (that's a separate, page-oriented action — the Dock's
   *  own "Add Card" button when a Page is selected). */
  async function handleCreateVaultCard(): Promise<Card> {
    return vault.createCardInCurrentFolder(t("common.untitled"));
  }

  /** Opening a vault Card into the current Page can 500 if the panel's cached list
   *  is stale — e.g. the Card was deleted (the Vault panel's own per-Card delete
   *  action) from a different PageCard elsewhere since the list was last fetched, so
   *  this cardId no longer exists. Re-syncing the list on failure clears the dead
   *  entry instead of leaving it clickable (and failing the same way) indefinitely. */
  async function handleAddVaultCardToPage(cardId: string) {
    if (!currentPage) return;
    try {
      await openCardIntoPage(currentPage.id, cardId);
    } catch {
      await vault.refresh(vault.query || undefined);
    }
  }

  /** The Feed Input Button's Add action (Step 6 spec §2.2) — creates a Card straight
   *  from whatever's typed into the expanded text field, bypassing AI entirely; blank
   *  if the field was empty. */
  async function handleAddCardToCurrentPage(content: string) {
    if (!currentPage) return;
    await createCardInPage(currentPage.id, "", content);
  }

  // Lets the Dock's text-selection quick-lookup row (Dock.tsx's showLookupRow) add
  // its result to the current Page/Dock without needing a prop threaded down to
  // it — see quickAddRegistry.ts's doc comment. Re-registers on every relevant
  // change since these are plain overwritten closures, not something anything else
  // observes reactively.
  useEffect(() => {
    registerQuickAddHandlers({
      addToPage: (html) => {
        if (currentPage) void createCardInPage(currentPage.id, "", html);
      },
      addToDock: (html) => {
        void dockCards.createCard("", html);
      },
    });
  }, [currentPage, createCardInPage, dockCards.createCard]);

  async function handleUploadFileToCurrentPage(file: File) {
    if (!currentPage) return;
    await uploadFileToPage(currentPage.id, file);
  }

  /** The Feed Input Button's type-picker "Stack" option (Step "Stacks" spec) —
   *  creates a new Stack Card, with one blank member, at the bottom of the current
   *  Page. Unlike every other type in that picker (still a stub — see
   *  FeedInputButton.tsx), a Stack needs its own creation endpoint
   *  (stackService.createStackInPage) rather than plain addNewCardToPage, since it
   *  also has to seed a first StackMember. */
  async function handleAddStackToCurrentPage() {
    if (!currentPage) return;
    await api.createStack(currentPage.id);
    await refresh();
  }

  /** The Feed Input Button's type-picker "Action" option — same "select this type
   *  = create it right away" shape as handleAddStackToCurrentPage above, just via
   *  plain addNewCardToPage (createCardInPage) with a metadata override rather
   *  than a dedicated creation endpoint, since there's no extra row (like a
   *  Stack's first StackMember) to seed. */
  async function handleAddActionToCurrentPage() {
    if (!currentPage) return;
    await createCardInPage(currentPage.id, "", "", {
      version: 1,
      typeId: "action",
      action: { label: "", jobId: null, jobParams: {} },
    });
  }

  /** The Feed Input Button's type-picker "Prompt" option — see
   *  handleAddActionToCurrentPage above for the same reasoning. */
  async function handleAddPromptToCurrentPage() {
    if (!currentPage) return;
    await createCardInPage(currentPage.id, "", "", {
      version: 1,
      typeId: "prompt",
      prompt: { input: "", iterations: [], activeIndex: 0, context: { mode: "none", cardIds: [] } },
    });
  }

  /** "Opening" an App (Apps feature spec §5) — instantiates a fresh copy server-side,
   *  then navigates straight to it. Reused by both an "action" Card's "openApp" job
   *  (handleRunActionJob below) and the App browser's own Open button. A scope "tab"
   *  App creates a brand-new Tab that `tabs` doesn't know about yet, so it needs an
   *  explicit refresh; a scope "page" App lands in the current Tab, so `refresh()`
   *  (usePages, already scoped to currentTabId) is what picks up its new Page — doing
   *  both unconditionally is simplest and the redundant one is harmless. */
  async function handleOpenApp(appId: string) {
    const result = await api.openApp(appId, currentTabId ? { tabId: currentTabId } : {});
    if (result.scope === "tab") {
      await tabs.refresh();
    }
    setCurrentTabId(result.tabId);
    setCurrentPageId(result.pageId);
    await refresh();
  }

  /** An inline actionButton node's click (ActionButtonNodeView.tsx) — dispatches to
   *  whichever of the small, fixed set of jobs (lib/actionJobs.ts) it's configured
   *  for. */
  function handleRunActionJob(
    pageCard: PageCardWithCard,
    jobId: string | undefined,
    jobParams: Record<string, unknown> | undefined,
  ) {
    runActionJob(pageCard, jobId, jobParams, {
      onCreateCard: (pc, title, content) => {
        void createCardInPage(pc.pageId, title, content);
      },
      onOpenApp: (appId) => {
        void handleOpenApp(appId);
      },
      // Anchored at the Action Card's own PageCard — same "insert directly below,
      // context is everything above" placement every other card-level generation
      // uses (generationService.ts's GenerationTarget), just triggered by this
      // button instead of the Dock's Generate action. Auto-saves on completion,
      // same as every other generation in the app today (useGeneration.ts).
      onPromptCard: (pc, instructions, contextMode) => {
        generation.start(pc.id, instructions, contextMode === "own");
      },
      onNewBlankPage: () => {
        void handleAddPageAtBottom();
      },
      onNewBlankTab: () => {
        void handleAddBlankTab();
      },
      onNavigatePage: (direction) => {
        if (direction === "up") navigateUp();
        else navigateDown();
      },
      onRemoveCard: (targetPageCardId) => {
        api.removePageCardFromPage(targetPageCardId).then(refresh).catch(() => {});
      },
      onSaveCard: (targetPageCardId) => {
        api.savePageCardToVault(targetPageCardId).then(() => refresh()).catch(() => {});
      },
    });
  }

  /** The "newBlankTab" Action Card job — unlike the Tabs panel's own "+"
   *  (tabs.createTab, which stays put), this job's whole point is "go there": a
   *  brand-new Tab with one blank Page, navigated to immediately. Built directly
   *  from the API client rather than usePages' addPage, since that hook is bound to
   *  whatever currentTabId already was — not the brand-new one this just created. */
  async function handleAddBlankTab() {
    const tab = await api.createTab();
    const page = await api.createPage(tab.id);
    await tabs.refresh();
    setCurrentTabId(tab.id);
    setCurrentPageId(page.id);
  }

  /** The Tabs panel's "Save as App" (Apps feature spec §5), scope "tab". While
   *  editingAppId is set, this updates that same App in place instead of opening the
   *  name/description modal — there's nothing new to ask for on a re-save. */
  async function handleSaveAsAppFromTab() {
    if (!currentTabId) return;
    if (editingAppId) {
      await api.updateAppSnapshot(editingAppId, { tabId: currentTabId });
      return;
    }
    setSaveAsAppRequest({ tabId: currentTabId });
  }

  /** The Pages panel's "Save as App", scope "page" — same editingAppId short-circuit
   *  as handleSaveAsAppFromTab above. */
  async function handleSaveAsAppFromPage() {
    if (!currentPage) return;
    if (editingAppId) {
      await api.updateAppSnapshot(editingAppId, { pageId: currentPage.id });
      return;
    }
    setSaveAsAppRequest({ pageId: currentPage.id });
  }

  /** SaveAsAppModal's submit — only ever reached for a brand-new App (see the
   *  editingAppId short-circuits above), so this always creates. */
  async function handleSubmitSaveAsApp(name: string, description: string) {
    if (!saveAsAppRequest) return;
    await api.createApp({ name, description: description || null, ...saveAsAppRequest });
    setSaveAsAppRequest(null);
  }

  /** The App browser's Open action — also reachable from an "action" Card's
   *  "openApp" job (handleRunActionJob above), both via handleOpenApp. */
  function handleOpenAppFromBrowser(app: WattleApp) {
    setAppBrowserOpen(false);
    void handleOpenApp(app.id);
  }

  /** The App browser's Edit action — opens a live copy exactly like Open does, but
   *  also sets editingAppId/Name so a later "Save as App" updates this App instead
   *  of creating a new one (Apps feature spec §5). Never offered for isCore Apps
   *  (AppBrowser.tsx hides the button; appService.ts rejects it server-side too). */
  function handleEditAppFromBrowser(app: WattleApp) {
    setAppBrowserOpen(false);
    setEditingAppId(app.id);
    setEditingAppName(app.name);
    void handleOpenApp(app.id);
  }

  function handleStopEditingApp() {
    setEditingAppId(null);
    setEditingAppName(null);
  }

  /** Removes one Card from the Page — the per-Card unit handleRemoveSelected below
   *  loops over for the Dock's own bulk "remove selected" action (there's no longer
   *  a per-Card "X" button; removal now only ever happens for the whole selection
   *  at once, see Card.tsx's headerActions doc comment). Same two rules the old
   *  per-Card button had: a Stack Card closes as a whole (stackService.closeStack,
   *  promoting any unsaved member to the vault first) since "remove" doesn't mean
   *  anything at the per-alternate level; anything else just detaches from the
   *  Page, vault Card untouched (pageCardService.removeFromPage). Deliberately
   *  doesn't touch selection state itself — handleRemoveSelected below deselects
   *  once, after every removal in the batch has gone through, rather than each
   *  call here doing it mid-loop. */
  async function handleRequestRemovePageCard(pageCardId: string) {
    const pageCard = currentPage?.pageCards.find((pc) => pc.id === pageCardId);
    if (!pageCard) return;
    if (focusedPageCardId === pageCardId) setFocusedPageCardId(null);
    if (getCardTypeId(pageCard.card) === "stack") {
      await api.closeStack(pageCard.card.id);
    } else {
      await api.removePageCardFromPage(pageCardId);
    }
    await refresh();
  }

  /** The Dock's bulk "Remove" action (selectedCards row) — removes every currently
   *  selected Card from the Page in one go, then clears the selection (there's
   *  nothing left on the Page for it to point at). Sequential, not Promise.all: each
   *  call's own refresh() re-fetches `pages`, so a later iteration's
   *  currentPage.pageCards lookup (handleRequestRemovePageCard) sees the previous
   *  removal already reflected rather than racing against a stale snapshot. */
  async function handleRemoveSelected() {
    for (const id of [...selectedPageCardIds]) {
      await handleRequestRemovePageCard(id);
    }
    deselectAll();
  }

  // Pages are only ever added at the bottom of the stack (the down arrow becomes a
  // "+" once there's nothing below the current Page — see PageStack.tsx) — so the
  // new Page's order goes below whatever the current bottom Page's is, rather than
  // appending on top like `createPage`'s own default.
  const bottomOrder = sortedPages.length ? sortedPages[sortedPages.length - 1].order : undefined;

  async function handleAddPageAtBottom() {
    const newPageId = await addPage(bottomOrder !== undefined ? bottomOrder - 1 : undefined);
    setNavDirection("down");
    setCurrentPageId(newPageId);
    deselectAll();
  }

  /** The Dock's merged page-nav "+" control, repurposed while moving (see the
   *  onAddPage prop below): creates a new Page at the bottom of the stack, same
   *  placement rule as handleAddPageAtBottom, then immediately drops the moving
   *  Card there as its first Card. */
  async function handleDropOnNewPage() {
    if (movingPageCardIds.size === 0) return;
    const newPageId = await addPage(bottomOrder !== undefined ? bottomOrder - 1 : undefined);
    setNavDirection("down");
    setCurrentPageId(newPageId);
    await handleDropAt(newPageId, 0);
  }

  /** Same as handleDropOnNewPage above, for a Dock Card Move in progress instead of
   *  a Page Card one. */
  async function handleDockCardDropOnNewPage() {
    if (movingDockCardIds.size === 0) return;
    const newPageId = await addPage(bottomOrder !== undefined ? bottomOrder - 1 : undefined);
    setNavDirection("down");
    setCurrentPageId(newPageId);
    await handleDropDockCardAt(newPageId, 0);
  }

  /** Same as handleDropOnNewPage above, for an embed Move in progress instead of a
   *  Page Card one. */
  async function handleEmbedDropOnNewPage() {
    if (!movingEmbedCard) return;
    const newPageId = await addPage(bottomOrder !== undefined ? bottomOrder - 1 : undefined);
    setNavDirection("down");
    setCurrentPageId(newPageId);
    await handleDropEmbedAt(newPageId, 0);
  }

  const pagesAboveCount = currentPageIndex === -1 ? 0 : currentPageIndex;

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
          direction={null}
          revealHidden={revealHidden}
          selectedPageCardIds={selectedPageCardIds}
          editingPageCardIds={editingPageCardIds}
          onTogglePageCard={toggleSelectPageCard}
          onCloseEditor={exitEditPageCard}
          onRequestEditPageCard={requestEditPageCard}
          onActivatePageCardEditor={activatePageCardEditor}
          onSavePageCard={handleSavePageCard}
          onOpenPageCardInVault={handleOpenCardInVault}
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
          onOpenFullscreen={setFocusedPageCardId}
          onTurnIntoStack={handleTurnIntoStackWithNewCard}
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

  return (
    <div className="app">
      {focusedOverlay ?? (
      <div
        className="page-viewport"
        onPointerDown={handleSwipeAreaPointerDown}
        onPointerUp={handleSwipeAreaPointerUp}
        onPointerCancel={handleSwipeAreaPointerCancel}
      >
        <PageStackEdges above={pagesAboveCount} />
        <main className="app__main">
          <PageStack
            currentPage={currentPage}
            direction={navDirection}
            revealHidden={revealHidden}
            selectedPageCardIds={selectedPageCardIds}
            editingPageCardIds={editingPageCardIds}
            onTogglePageCard={toggleSelectPageCard}
            onCloseEditor={exitEditPageCard}
            onRequestEditPageCard={requestEditPageCard}
            onActivatePageCardEditor={activatePageCardEditor}
            onSavePageCard={handleSavePageCard}
            onOpenPageCardInVault={handleOpenCardInVault}
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
            onOpenFullscreen={setFocusedPageCardId}
            onTurnIntoStack={handleTurnIntoStackWithNewCard}
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
                    generating: generation.isStreaming,
                    onStopGeneration: generation.stop,
                    onGenerate: handleGeneratePage,
                    onAddCard: handleAddCardToCurrentPage,
                    onOpenVault: () => setOpenPanel("vault"),
                    onUploadFile: handleUploadFileToCurrentPage,
                    onAddStack: handleAddStackToCurrentPage,
                    onAddAction: handleAddActionToCurrentPage,
                    onAddPrompt: handleAddPromptToCurrentPage,
                  }
                : null
            }
          />
        </main>
      </div>
      )}

      <Dock
        selectedCards={selectedPageCards}
        selectedEmbedIds={selectedEmbedIdSet}
        selectedEmbedId={selectedPageCards.length === 0 ? singleSelectedEmbed?.cardId ?? null : null}
        isEditingActive={isEditingActive}
        onExitEditing={exitEditing}
        onRemoveEmbed={handleRemoveEmbed}
        onDeleteEmbed={handleDeleteEmbed}
        generationError={generation.error}
        onDismissGenerationError={generation.dismissError}
        generationNotice={generation.notice}
        onDismissGenerationNotice={generation.dismissNotice}
        annotationError={annotations.error}
        onDismissAnnotationError={annotations.dismissError}
        onFreezeSelected={handleFreezeSelected}
        onSaveSelected={handleSaveSelected}
        onRemoveSelected={handleRemoveSelected}
        onToggleHiddenSelected={handleToggleHiddenSelected}
        onRewriteSelected={handleRewriteSelected}
        onRunProcess={
          dockAnnotationCardId
            ? (process) => {
                console.debug("[annot] Dock onRunProcess fired", {
                  process,
                  dockAnnotationCardId,
                  dockAnnotationPageCardId,
                });
                handleRunProcess(dockAnnotationCardId, process, undefined, dockAnnotationPageCardId);
              }
            : null
        }
        processRunning={annotations.running}
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
        onDeselectAll={deselectAll}
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
        nearbyItems={nearby.items}
        nearbyLoading={nearby.loading}
        onOpenNearbyCard={handleOpenNearbyCard}
        revealHidden={revealHidden}
        onToggleRevealHidden={() => setRevealHidden((r) => !r)}
        vaultSearchResults={vault.cards}
        vaultQuery={vault.query}
        onVaultQueryChange={vault.setQuery}
        vaultFolderContents={vault.folderContents}
        onOpenVaultFolder={vault.openFolder}
        onCreateVaultCard={handleCreateVaultCard}
        onCreateVaultFolder={vault.createFolder}
        onUploadVaultFile={vault.uploadFile}
        onRenameVaultCard={vault.renameCard}
        onRenameVaultFolder={vault.renameFolder}
        onMoveVaultCard={vault.moveCard}
        onMoveVaultFolder={vault.moveFolder}
        onDeleteVaultCard={vault.deleteCard}
        onDeleteVaultFolder={vault.deleteFolder}
        onAddVaultCardToPage={currentPage ? handleAddVaultCardToPage : null}
        onAddVaultCardToDock={handleAddVaultCardToDock}
        dockCards={dockCards.dockCards}
        editingDockCardIds={editingEmbedIds}
        onToggleDockCardEdit={toggleEditEmbed}
        onCreateDockCard={dockCards.createCard}
        onUploadDockCardFile={dockCards.uploadFile}
        dockCardToOpen={dockCardToOpen}
        onOpenedDockCard={() => setDockCardToOpen(null)}
        selectedDockCardIds={selectedDockCardIds}
        onToggleSelectDockCard={toggleSelectDockCard}
        onDeselectDockCards={deselectDockCards}
        onCloseSelectedDockCards={handleCloseSelectedDockCards}
        onMoveSelectedDockCardsToPage={handleEnterDockCardMoveMode}
        sortedPages={sortedPages}
        currentPageIndex={currentPageIndex}
        onSelectPage={navigateToIndex}
        canNavigateUp={canNavigateUp}
        canNavigateDown={canNavigateDown}
        onNavigateUp={navigateUp}
        onNavigateDown={navigateDown}
        onAddPage={
          movingPageCardIds.size > 0
            ? handleDropOnNewPage
            : movingDockCardIds.size > 0
              ? handleDockCardDropOnNewPage
              : movingEmbedCard !== null
                ? handleEmbedDropOnNewPage
                : handleAddPageAtBottom
        }
        tabs={sortedTabs}
        currentTabIndex={currentTabIndex}
        onSelectTab={switchToTabIndex}
        onCreateTab={() => tabs.createTab()}
        onSaveAsAppFromTab={handleSaveAsAppFromTab}
        onSaveAsAppFromPage={handleSaveAsAppFromPage}
        editingAppName={editingAppName}
        onStopEditingApp={handleStopEditingApp}
      />
      {saveAsAppRequest && (
        <SaveAsAppModal onSubmit={handleSubmitSaveAsApp} onClose={() => setSaveAsAppRequest(null)} />
      )}
      {appBrowserOpen && (
        <AppBrowser
          onOpen={handleOpenAppFromBrowser}
          onEdit={handleEditAppFromBrowser}
          onClose={() => setAppBrowserOpen(false)}
        />
      )}
    </div>
  );
}

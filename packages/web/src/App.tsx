import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Card } from "@wattle/shared";
import type { AnnotationProcess } from "./api/client.js";
import { Dock } from "./components/Dock/Dock.js";
import type { DockPanel } from "./components/Dock/Dock.js";
import { PageStack } from "./components/PageStack/PageStack.js";
import { PageStackEdges } from "./components/PageStack/PageStackEdges.js";
import * as api from "./api/client.js";
import { usePages } from "./hooks/usePages.js";
import { useVault } from "./hooks/useVault.js";
import { useDockCards } from "./hooks/useDockCards.js";
import { useTabs } from "./hooks/useTabs.js";
import { useGeneration } from "./hooks/useGeneration.js";
import { useAnnotations } from "./hooks/useAnnotations.js";
import { getCachedCard, notifySaved, subscribeToCard } from "./lib/cardStore.js";
import { t } from "./i18n/index.js";

export function App() {
  /** The single currently-selected top-level Card, if any, on the current Page —
   *  only ever one at a time (toggleSelectPageCard replaces rather than adds to
   *  this); tapping an already-selected Card again jumps into editing it instead.
   *  Still a Set (rather than a plain id) since most call sites batch-shaped code
   *  over it unchanged. Selection Lock (§4.3) keeps Page/Tab navigation disabled the
   *  whole time this is non-empty, so its id is guaranteed to belong to
   *  `currentPage` — nothing can navigate out from under it. */
  const [selectedPageCardIds, setSelectedPageCardIds] = useState<Set<string>>(new Set());
  /** Which Page fills the screen right now (Step 7: Pages are full-screen, navigated
   *  with the up/down arrows, one visible at a time — not a click-to-select thing). */
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  /** Which selected Cards are in their own inline edit mode — always a subset of
   *  `selectedPageCardIds` (toggleSelectPageCard below drops a deselected Card from
   *  this set too). Independent per-Card, same convention as editingEmbedIds. */
  const [editingPageCardIds, setEditingPageCardIds] = useState<Set<string>>(new Set());
  /** An independently-selected embedded Card (CardRichText.tsx/CardEmbed.tsx's
   *  click-to-select), separate from `selectedPageCardIds` — see Dock.tsx's
   *  embed-selected action row. `onRemove` is the exact splice closure captured at
   *  selection time for stripping this embed's token back out of its parent. */
  const [selectedEmbed, setSelectedEmbed] = useState<{ cardId: string; onRemove: () => void } | null>(
    null,
  );
  /** An embed "in transit" to a Page position (the embed action row's own Move) —
   *  same shape as `selectedEmbed` (it *is* what was selected, carried forward the
   *  same way movingPageCardIds carries selectedPageCardIds forward), but kept as a
   *  separate piece of state since entering this mode clears `selectedEmbed` itself
   *  (there's no existing PageCard/DockCard row for an embed the way there is for a
   *  Page/Dock Card, so nothing else needs the selection to persist — see
   *  handleEnterEmbedMoveMode). */
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
   *  selectedPageCardIds/selectedEmbed: selecting one clears the others, so the
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
  // which every annotation mutation triggers (see the handle* wrappers).
  const selectedEmbedCard = useSyncExternalStore(
    (onChange) => (selectedEmbed ? subscribeToCard(selectedEmbed.cardId, onChange) : () => {}),
    () => (selectedEmbed ? getCachedCard(selectedEmbed.cardId) : undefined),
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

  /** A plain tap on a Card (Card.tsx's onSelect) — replaces whatever was selected
   *  with just this one Card (only ever one Page Card selected at a time now — no
   *  more cumulative multi-select), or, if it's already the one selected, jumps
   *  straight into editing it instead of deselecting — deselecting is no longer a
   *  tap gesture at all; see exitEditPageCard and the Dock's own back-caret action.
   *  Always hands focus away from whatever embed was independently selected, same
   *  as before. */
  function toggleSelectPageCard(id: string) {
    if (selectedPageCardIds.has(id)) {
      setEditingPageCardIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      return;
    }
    setSelectedPageCardIds(new Set([id]));
    setEditingPageCardIds(new Set());
    setSelectedEmbed(null);
    // Mutually exclusive with Dock Card selection (see toggleSelectDockCard) — the
    // Dock's action row only ever shows one selection's actions at a time.
    setSelectedDockCardIds(new Set());
  }

  /** The click-outside-to-close effect (Card.tsx's onCloseEditor) — exits editing
   *  and deselects this Card, same net effect toggleSelectPageCard used to have when
   *  tapping an already-selected+editing Card removed it from both sets. */
  function exitEditPageCard(id: string) {
    setEditingPageCardIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setSelectedPageCardIds((prev) => {
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

  /** True while whatever's currently selected (a Page Card, a Dock Card, or an embed)
   *  is also in its own inline edit mode — Dock.tsx swaps its action row for the
   *  rich-text formatting toolbar (bold/italic/heading/lists) for exactly this long. */
  const isEditingActive =
    (!!selectedEmbed && editingEmbedIds.has(selectedEmbed.cardId)) ||
    [...selectedPageCardIds].some((id) => editingPageCardIds.has(id)) ||
    selectedDockCardCardIds.some((cardId) => editingEmbedIds.has(cardId));

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
    setSelectedEmbed(null);
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

  // Double-click / long-press a Card (Card.tsx) to jump straight into editing it —
  // replaces whatever else was selected with just this one Card and opens its
  // editor, regardless of what was selected/being edited before (a deliberate,
  // explicit "edit this one now" gesture, distinct from the cumulative
  // tap-to-add-to-selection gesture toggleSelectPageCard above handles).
  function requestEditPageCard(id: string) {
    setSelectedPageCardIds(new Set([id]));
    setEditingPageCardIds(new Set([id]));
    setSelectedEmbed(null);
    setSelectedDockCardIds(new Set());
  }

  /** Selects an embedded Card independently of whatever top-level Card contains it —
   *  clicking the same one again jumps into editing it instead, same
   *  add-to-selection-or-jump-to-edit convention as toggleSelectPageCard (deselecting
   *  is the Dock's own back-caret action now, not a tap gesture). Deliberately
   *  doesn't touch selectedPageCardIds/editingPageCardIds: the containing Card stays
   *  exactly as selected/editing as it was. */
  function selectEmbed(cardId: string, onRemove: () => void) {
    if (selectedEmbed?.cardId === cardId) {
      setEditingEmbedIds((prev) => (prev.has(cardId) ? prev : new Set(prev).add(cardId)));
      return;
    }
    setSelectedEmbed({ cardId, onRemove });
    setSelectedDockCardIds(new Set());
  }

  /** Double-click / long-press an embedded Card (CardEmbed.tsx) to jump straight into
   *  editing it — selects it and turns its edit mode on in one action, same
   *  convention as requestEditPageCard above for top-level Cards. Deliberately not a
   *  toggle (repeat double-clicks/long-presses on an already-editing embed just leave
   *  it as is), and deliberately doesn't touch any other Card/embed's state. */
  function requestEditEmbed(cardId: string, onRemove: () => void) {
    setSelectedEmbed({ cardId, onRemove });
    setEditingEmbedIds((prev) => (prev.has(cardId) ? prev : new Set(prev).add(cardId)));
  }

  /** Toggles one embedded Card's own inline edit mode on/off — the Dock's Edit action
   *  for a selected embed, and also what CardEmbed.tsx's click-outside effect calls to
   *  close it (mirroring Card.tsx's "there's no separate Done action" convention).
   *  Deliberately independent of `selectedEmbed`/`editingPageCardIds` — toggling one
   *  embed's edit state never touches selection or any other Card's edit state. */
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

  function handleRemoveEmbed() {
    if (!selectedEmbed) return;
    selectedEmbed.onRemove();
    setSelectedEmbed(null);
  }

  // Deletes the embedded Card from the vault entirely (same global delete the Vault
  // panel uses — vault.deleteCard), then strips the now-dangling token out of this
  // particular parent too, rather than leaving CardEmbed's "not found" fallback
  // showing indefinitely where the user was just looking.
  async function handleDeleteEmbed() {
    if (!selectedEmbed) return;
    const { cardId, onRemove } = selectedEmbed;
    setSelectedEmbed(null);
    onRemove();
    await vault.deleteCard(cardId);
    await refresh();
  }

  /** The Dock's own back-caret action (the one universal way to deselect now,
   *  across Page Cards/Dock Cards/embeds alike) while an embed is selected — plain
   *  deselect, same as deselectAll/deselectDockCards, leaving the embed exactly
   *  where it is. Distinct from Remove (strips the token) and Delete (strips the
   *  token and deletes the underlying Card) — those stay their own explicit actions,
   *  this only clears selection/editing state. */
  function handleDeselectEmbed() {
    if (selectedEmbed) {
      setEditingEmbedIds((prev) => {
        if (!prev.has(selectedEmbed.cardId)) return prev;
        const next = new Set(prev);
        next.delete(selectedEmbed.cardId);
        return next;
      });
    }
    setSelectedEmbed(null);
  }

  /** The embed action row's own Move — enters Move Mode the same way
   *  handleEnterMoveMode does for Page Cards, carrying `selectedEmbed` forward as
   *  `movingEmbedCard` rather than a PageCard id (there isn't one yet — see
   *  movingEmbedCard's own doc comment). Closes whatever panel was open, same
   *  reasoning as handleEnterDockCardMoveMode. */
  function handleEnterEmbedMoveMode() {
    if (!selectedEmbed) return;
    setMovingEmbedCard(selectedEmbed);
    setSelectedEmbed(null);
    setOpenPanel(null);
  }

  // Restores the selection rather than leaving nothing selected, so Cancel lands
  // back on the embed's own action row — same place Page Card Move Mode's Cancel
  // lands (selectedPageCardIds is never cleared to begin with there).
  function handleCancelEmbedMove() {
    if (movingEmbedCard) setSelectedEmbed(movingEmbedCard);
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
   *  Reads movingEmbedCard rather than selectedEmbed: entering embed Move Mode
   *  already cleared the latter (see handleEnterEmbedMoveMode). */
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

  // Which Card a Dock process action would run against — an embed takes priority,
  // same convention as selectedEmbedId elsewhere (Dock.tsx/richtext/CardRichText.tsx). Null
  // when nothing's selected (or more than one Card is).
  const dockAnnotationCardId = selectedEmbed?.cardId ?? singleSelectedCard?.card.id ?? null;
  // An embed never has one (embeds always write straight through to the vault, no
  // draft step) — only a top-level singleSelectedCard's own PageCard id counts here.
  const dockAnnotationPageCardId = selectedEmbed ? undefined : singleSelectedCard?.id;
  const dockAnnotations = selectedEmbed
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
  ) {
    console.debug("[annot] App.handleRunProcess", { cardId, process, selectionText, pageCardId });
    await annotations.runProcess(cardId, process, selectionText, pageCardId);
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

  /** The Dock's Circle when one or more Cards are selected (Step 6 spec §4.2) —
   *  anchored to the selection rather than the bottom of the Page: inserts directly
   *  below whichever selected Card sorts last (the bottommost one, if more than one
   *  is selected), same "insert directly below the trigger" semantics as a single
   *  Card's generation always had, just extended to pick an anchor out of a group. */
  function handleGenerateSelected() {
    if (selectedPageCards.length === 0) return;
    const bottommost = [...selectedPageCards].sort((a, b) => b.order - a.order)[0];
    generation.start(bottommost.id);
  }

  /** Saves every selected Card that has something pending to the vault — a no-op for
   *  any that don't (Step 6 spec §4.2's batched Save). */
  async function handleSaveSelected() {
    const toSave = selectedPageCards.filter(
      (pc) => pc.draftTitle !== null || pc.draftContent !== null || !pc.card.savedToVault,
    );
    if (toSave.length === 0) return;
    await Promise.all(toSave.map((pc) => api.savePageCardToVault(pc.id)));
    // Same reasoning as the old single-Card handleSave: a plain REST call per Card,
    // not routed through cardStore, so notifySaved tells the Vault panel about each
    // one directly rather than relying on subscribeToSaves to fire on its own.
    for (const pc of toSave) notifySaved(pc.card.id);
    await refresh();
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
    await createCardInPage(currentPage.id, t("common.untitled"), content);
  }

  async function handleUploadFileToCurrentPage(file: File) {
    if (!currentPage) return;
    await uploadFileToPage(currentPage.id, file);
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

  return (
    <div className="app">
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
            selectedPageCardIds={selectedPageCardIds}
            editingPageCardIds={editingPageCardIds}
            onTogglePageCard={toggleSelectPageCard}
            onCloseEditor={exitEditPageCard}
            onRequestEditPageCard={requestEditPageCard}
            onChangeDraft={handleChangeDraft}
            selectedEmbedId={selectedEmbed?.cardId ?? null}
            onSelectEmbed={selectEmbed}
            onRequestEditEmbed={requestEditEmbed}
            editingEmbedIds={editingEmbedIds}
            onToggleEmbedEdit={toggleEditEmbed}
            onRunProcess={handleRunProcess}
            onCreateManualHighlight={handleCreateManualHighlight}
            onAcceptDiff={handleAcceptDiff}
            onRemoveAnnotation={handleRemoveAnnotation}
            onUpdateAnnotationText={handleUpdateAnnotationText}
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
                  }
                : null
            }
          />
        </main>
      </div>

      <Dock
        selectedCards={selectedPageCards}
        selectedEmbedId={selectedEmbed?.cardId ?? null}
        isEditingActive={isEditingActive}
        onRemoveEmbed={handleRemoveEmbed}
        onDeleteEmbed={handleDeleteEmbed}
        generationError={generation.error}
        onDismissGenerationError={generation.dismissError}
        generationNotice={generation.notice}
        onDismissGenerationNotice={generation.dismissNotice}
        annotationError={annotations.error}
        onDismissAnnotationError={annotations.dismissError}
        onSaveSelected={handleSaveSelected}
        generating={generation.isStreaming}
        onStopGeneration={generation.stop}
        onGenerateSelected={handleGenerateSelected}
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
        vaultSearchResults={vault.cards}
        vaultQuery={vault.query}
        onVaultQueryChange={vault.setQuery}
        vaultFolderContents={vault.folderContents}
        onOpenVaultFolder={vault.openFolder}
        onCreateVaultCard={handleCreateVaultCard}
        onCreateVaultFolder={vault.createFolder}
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
      />
    </div>
  );
}

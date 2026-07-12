import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AnnotationProcess } from "./api/client.js";
import { Dock } from "./components/Dock/Dock.js";
import { PageNav } from "./components/PageNav/PageNav.js";
import { PageStack } from "./components/PageStack/PageStack.js";
import { PageStackEdges } from "./components/PageStack/PageStackEdges.js";
import * as api from "./api/client.js";
import { usePages } from "./hooks/usePages.js";
import { useVault } from "./hooks/useVault.js";
import { useGeneration } from "./hooks/useGeneration.js";
import { useAnnotations } from "./hooks/useAnnotations.js";
import { getCachedCard, notifySaved, subscribeToCard } from "./lib/cardStore.js";
import { t } from "./i18n/index.js";

export function App() {
  const [selectedPageCardId, setSelectedPageCardId] = useState<string | null>(null);
  /** Which Page fills the screen right now (Step 7: Pages are full-screen, navigated
   *  with the up/down arrows, one visible at a time — not a click-to-select thing). */
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  /** An independently-selected embedded Card (CardContent.tsx/CardEmbed.tsx's
   *  click-to-select), separate from `selectedPageCardId` — see Dock.tsx's
   *  embed-selected action row. `onRemove` is the exact splice closure captured at
   *  selection time for stripping this embed's token back out of its parent. */
  const [selectedEmbed, setSelectedEmbed] = useState<{ cardId: string; onRemove: () => void } | null>(
    null,
  );
  /** Embedded Cards (any depth, any number at once) currently in their own inline
   *  edit mode — independent of both `isEditing` (the top-level Card) and of each
   *  other, so a parent and any combination of its embeds can be editing or not,
   *  each on its own. Keyed by the embedded Card's own id (not a PageCard id, since
   *  embeds have no PageCard of their own) — see CardEmbed.tsx. */
  const [editingEmbedIds, setEditingEmbedIds] = useState<Set<string>>(new Set());
  /** Move Mode (Dock's Move action) — the PageCard id currently "in transit" waiting
   *  for a drop target tap, or null when not moving. Deliberately not touched by
   *  navigateToIndex's selectPageCard(null) call, so it persists across Page
   *  navigation (see PageStack.tsx/Dock.tsx). */
  const [movingPageCardId, setMovingPageCardId] = useState<string | null>(null);

  const {
    pages,
    addPage,
    removePage,
    createCardInPage,
    openCardIntoPage,
    refresh,
    uploadFileToPage,
    updateDraftLocally,
  } = usePages();
  const vault = useVault();
  // Auto-saves the moment a generation lands (cleanly or via Stop) — no separate
  // review step. `refresh` re-fetches `pages` so the newly-saved Card shows up;
  // useGeneration.ts awaits this before clearing its own ghost-card state, so there's
  // no flash of "nothing there" in between.
  const generation = useGeneration(refresh);
  const annotations = useAnnotations();

  // The currently-selected Card/embed's own live annotations, for the Dock's process/
  // accept-all-diffs actions (pendingDiffCount) — an embed's Card only lives in
  // cardStore (not `pages`), so it needs its own subscription; a top-level
  // selectedPageCard's Card comes back through `pages` on every refresh() below,
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

  // Selecting/deselecting a Card (a plain tap) always exits inline editing. This is
  // deliberately NOT a blanket "reset on any selectedPageCardId change" effect
  // any more: requestEditPageCard below needs to set selectedPageCardId *and*
  // isEditing together in the same action, and an effect keyed on selectedPageCardId
  // would fire right after and immediately flip isEditing back off.
  function selectPageCard(id: string | null) {
    setSelectedPageCardId(id);
    setIsEditing(false);
    setSelectedEmbed(null);
  }

  // Double-click / long-press a Card (Card.tsx) to jump straight into editing it —
  // selects it and opens the editor in one action, regardless of whatever was
  // selected/being edited before.
  function requestEditPageCard(id: string) {
    setSelectedPageCardId(id);
    setIsEditing(true);
    setSelectedEmbed(null);
  }

  /** Selects an embedded Card independently of whatever top-level Card contains it —
   *  clicking the same one again toggles it back off, same convention as
   *  selectPageCard's toggle. Deliberately doesn't touch selectedPageCardId/isEditing:
   *  the containing Card stays exactly as selected/editing as it was. */
  function selectEmbed(cardId: string, onRemove: () => void) {
    setSelectedEmbed((prev) => (prev?.cardId === cardId ? null : { cardId, onRemove }));
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
   *  Deliberately independent of `selectedEmbed`/`isEditing` — toggling one embed's
   *  edit state never touches selection or any other Card's edit state. */
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

  function handleEditSelectedEmbed() {
    if (!selectedEmbed) return;
    toggleEditEmbed(selectedEmbed.cardId);
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

  const currentPageIndex = sortedPages.findIndex((p) => p.id === currentPageId);
  const currentPage = currentPageIndex === -1 ? null : sortedPages[currentPageIndex];
  const canNavigateUp = currentPageIndex > 0;
  const canNavigateDown = currentPageIndex !== -1 && currentPageIndex < sortedPages.length - 1;

  /** Which way the Page transition animation should play (PageStack.tsx) — "up"
   *  slides the new Page in from below (moving toward the top of the stack, index
   *  decreasing), "down" from above. Set right before the Page actually changes so
   *  PageStack's remount (keyed on the new Page's id) picks up the right direction
   *  class on first paint. */
  const [navDirection, setNavDirection] = useState<"up" | "down" | null>(null);

  /** Jumps straight to any Page by its position in `sortedPages` — used by both
   *  arrow navigation and the PageNav dot selector (Step: page indicator), so there's
   *  one place that derives the animation direction and resets selection/refreshes. */
  function navigateToIndex(index: number) {
    const target = sortedPages[index];
    if (!target || target.id === currentPageId) return;
    setNavDirection(index < currentPageIndex ? "up" : "down");
    setCurrentPageId(target.id);
    selectPageCard(null);
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

  const selectedPageCard = useMemo(
    () =>
      pages.flatMap((p) => p.pageCards).find((pc) => pc.id === selectedPageCardId) ?? null,
    [pages, selectedPageCardId],
  );

  // The Page you're currently viewing counts as "selected" for the Dock's Add
  // Card/Delete Page actions whenever no Card is selected — there's no separate
  // click-to-select-a-Page step any more (Step 7).
  const selectedPageForDock = selectedPageCard ? null : currentPage;

  const editingPageCardId = isEditing ? selectedPageCardId : null;

  // Which Card a Dock process action would run against — an embed takes priority,
  // same convention as selectedEmbedId elsewhere (Dock.tsx/CardContent.tsx). Null
  // when nothing's selected, matching onGeneratePage's null-when-unavailable pattern.
  const dockAnnotationCardId = selectedEmbed?.cardId ?? selectedPageCard?.card.id ?? null;
  // An embed never has one (embeds always write straight through to the vault, no
  // draft step) — only a top-level selectedPageCard's own PageCard id counts here.
  const dockAnnotationPageCardId = selectedEmbed ? undefined : selectedPageCard?.id;
  const dockAnnotations = selectedEmbed
    ? (selectedEmbedCard?.metadata.annotations ?? [])
    : (selectedPageCard?.card.metadata.annotations ?? []);
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

  // The "nothing selected" counterpart — Dock's Generate action when only a Page is
  // in view (selectedPageForDock). Appends at the bottom of the Page instead of
  // directly below a specific Card; see generationService.persistGeneratedCardToPage.
  function handleGeneratePage() {
    if (!currentPage) return;
    generation.startForPage(currentPage.id);
  }

  async function handleSave() {
    if (!selectedPageCard) return;
    await api.savePageCardToVault(selectedPageCard.id);
    // The publishCard guard fix in cardStore.ts means the following refresh()'s
    // publishCard calls (usePages.ts) will apply cleanly even if this Card has no
    // write in flight through cardStore itself (the Save action is a plain REST
    // call, not routed through editCard). notifySaved separately lets useVault
    // (which isn't otherwise connected to usePages' refresh) know a save just
    // happened, so the Vault panel picks up the change too.
    notifySaved(selectedPageCard.card.id);
    await refresh();
  }

  async function handleRemoveFromPage() {
    if (!selectedPageCard) return;
    const cardId = selectedPageCard.card.id;
    selectPageCard(null);
    await api.removePageCardFromPage(selectedPageCard.id);
    await refresh();
    // "Remove" never deletes the vault Card (see pageCardService.removeFromPage) —
    // it can even *promote* one into the vault, if it was still page-local scratch
    // content. That's a plain REST call, not routed through cardStore, so
    // subscribeToSaves won't fire for it on its own — notifySaved tells the Vault
    // panel (useVault) directly in case this Card just became newly vaulted.
    notifySaved(cardId);
  }

  function handleEnterMoveMode() {
    if (!selectedPageCardId) return;
    setMovingPageCardId(selectedPageCardId);
  }

  function handleCancelMove() {
    setMovingPageCardId(null);
  }

  async function handleDropAt(destPageId: string, destIndex: number) {
    if (!movingPageCardId) return;
    const id = movingPageCardId;
    setMovingPageCardId(null);
    selectPageCard(null);
    await api.movePageCard(id, destPageId, destIndex);
    await refresh();
  }

  // Draft edits fire on every keystroke (Card.tsx/CardContentEditor.tsx's
  // onChangeDraft). Two things could otherwise go wrong under fast typing, now that
  // CardContentEditor can have several independently-typeable text segments:
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

  /**
   * The Vault panel's "new file" action creates the Card via `usePages` (so it lands
   * directly on the Page, IDE-style — see VaultView's doc comment), which only
   * refreshes `usePages`' own state. `useVault`'s Card list is separate state that
   * only refetches when its search query changes, so without this it'd go stale:
   * reopening the panel wouldn't show the Card `createCardInPage` just created.
   */
  async function handleCreateCardInVault(pageId: string) {
    await createCardInPage(pageId, t("common.untitled"), "");
    await vault.refresh(vault.query || undefined);
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

  async function handleAddCardToCurrentPage() {
    if (!currentPage) return;
    await createCardInPage(currentPage.id, t("common.untitled"), "");
  }

  async function handleUploadFileToCurrentPage(file: File) {
    if (!currentPage) return;
    await uploadFileToPage(currentPage.id, file);
  }

  async function handleDeleteCurrentPage() {
    if (!currentPage) return;
    await removePage(currentPage.id);
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
    selectPageCard(null);
  }

  /** The PageNav "+" control, repurposed while moving (see the onAddPage prop below):
   *  creates a new Page at the bottom of the stack, same placement rule as
   *  handleAddPageAtBottom, then immediately drops the moving Card there as its
   *  first Card. */
  async function handleDropOnNewPage() {
    if (!movingPageCardId) return;
    const newPageId = await addPage(bottomOrder !== undefined ? bottomOrder - 1 : undefined);
    setNavDirection("down");
    setCurrentPageId(newPageId);
    await handleDropAt(newPageId, 0);
  }

  const pagesAboveCount = currentPageIndex === -1 ? 0 : currentPageIndex;

  return (
    <div className="app">
      <div className="page-viewport">
        <PageStackEdges above={pagesAboveCount} />
        <main className="app__main">
          <PageStack
            currentPage={currentPage}
            direction={navDirection}
            selectedPageCardId={selectedPageCardId}
            editingPageCardId={editingPageCardId}
            onSelectPageCard={selectPageCard}
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
            movingPageCardId={movingPageCardId}
            onDropAt={(index) => handleDropAt(currentPage!.id, index)}
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
          />
        </main>
      </div>

      <PageNav
        pages={sortedPages}
        currentIndex={currentPageIndex}
        canNavigateUp={canNavigateUp}
        canNavigateDown={canNavigateDown}
        onNavigateUp={navigateUp}
        onNavigateDown={navigateDown}
        onSelectPage={navigateToIndex}
        onAddPage={movingPageCardId ? handleDropOnNewPage : handleAddPageAtBottom}
      />

      <Dock
        selected={selectedPageCard}
        selectedPage={selectedPageForDock}
        selectedEmbedId={selectedEmbed?.cardId ?? null}
        onEditEmbed={handleEditSelectedEmbed}
        onRemoveEmbed={handleRemoveEmbed}
        onDeleteEmbed={handleDeleteEmbed}
        generating={generation.isStreaming}
        onStopGeneration={generation.stop}
        generationError={generation.error}
        onDismissGenerationError={generation.dismissError}
        generationNotice={generation.notice}
        onDismissGenerationNotice={generation.dismissNotice}
        annotationError={annotations.error}
        onDismissAnnotationError={annotations.dismissError}
        onEdit={() => setIsEditing(true)}
        onSave={handleSave}
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
        onRemoveFromPage={handleRemoveFromPage}
        onAddCardToPage={handleAddCardToCurrentPage}
        onGeneratePage={currentPage ? handleGeneratePage : null}
        onDeletePage={handleDeleteCurrentPage}
        movingPageCardId={movingPageCardId}
        onEnterMoveMode={handleEnterMoveMode}
        onCancelMove={handleCancelMove}
        onUploadFileToPage={currentPage ? handleUploadFileToCurrentPage : null}
        vaultCards={vault.cards}
        vaultQuery={vault.query}
        onVaultQueryChange={vault.setQuery}
        onCreateCardInPage={currentPage ? () => handleCreateCardInVault(currentPage.id) : null}
        onDeleteVaultCard={vault.deleteCard}
        onAddVaultCardToPage={currentPage ? handleAddVaultCardToPage : null}
      />
    </div>
  );
}

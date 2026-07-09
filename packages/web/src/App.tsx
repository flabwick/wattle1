import { useEffect, useMemo, useState } from "react";
import { Dock } from "./components/Dock/Dock.js";
import { PageNav } from "./components/PageNav/PageNav.js";
import { PageStack } from "./components/PageStack/PageStack.js";
import * as api from "./api/client.js";
import { usePages } from "./hooks/usePages.js";
import { useVault } from "./hooks/useVault.js";
import { useGeneration } from "./hooks/useGeneration.js";
import { t } from "./i18n/index.js";

export function App() {
  const [selectedPageCardId, setSelectedPageCardId] = useState<string | null>(null);
  /** Which Page fills the screen right now (Step 7: Pages are full-screen, navigated
   *  with the up/down arrows, one visible at a time — not a click-to-select thing). */
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const { pages, addPage, removePage, createCardInPage, openCardIntoPage, generate, refresh } =
    usePages();
  const vault = useVault();
  const generation = useGeneration();

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
  }

  // Double-click / long-press a Card (Card.tsx) to jump straight into editing it —
  // selects it and opens the editor in one action, regardless of whatever was
  // selected/being edited before.
  function requestEditPageCard(id: string) {
    setSelectedPageCardId(id);
    setIsEditing(true);
  }

  const currentPageIndex = sortedPages.findIndex((p) => p.id === currentPageId);
  const currentPage = currentPageIndex === -1 ? null : sortedPages[currentPageIndex];
  const canNavigateUp = currentPageIndex > 0;
  const canNavigateDown = currentPageIndex !== -1 && currentPageIndex < sortedPages.length - 1;

  function navigateUp() {
    if (!canNavigateUp) return;
    setCurrentPageId(sortedPages[currentPageIndex - 1].id);
    selectPageCard(null);
  }

  function navigateDown() {
    if (!canNavigateDown) return;
    setCurrentPageId(sortedPages[currentPageIndex + 1].id);
    selectPageCard(null);
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

  async function handleGenerate() {
    if (!selectedPageCard) return;
    setGenerating(true);
    try {
      // Stream a live preview first (Step 3) — this is read-only and never persists
      // anything (see docs/step2-model-providers.md), so the actual save below is
      // unchanged from before this hook existed. Best-effort: if streaming fails for
      // any reason, still fall through to the real (persisting) generate call so
      // Generate keeps working exactly as it did pre-Step-3.
      await generation.start(selectedPageCard.id).catch(() => {});
      await generate(selectedPageCard.id);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!selectedPageCard) return;
    await api.savePageCardToVault(selectedPageCard.id);
    await refresh();
  }

  async function handleRemoveFromPage() {
    if (!selectedPageCard) return;
    selectPageCard(null);
    await api.removePageCardFromPage(selectedPageCard.id);
    await refresh();
  }

  async function handleDeleteEntirely() {
    if (!selectedPageCard) return;
    selectPageCard(null);
    await api.deletePageCardEntirely(selectedPageCard.id);
    await refresh();
  }

  async function handleChangeDraft(
    pageCardId: string,
    draft: { title?: string; content?: string },
  ) {
    await api.updatePageCardDraft(pageCardId, draft);
    await refresh();
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

  async function handleAddCardToCurrentPage() {
    if (!currentPage) return;
    await createCardInPage(currentPage.id, t("common.untitled"), "");
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
    setCurrentPageId(newPageId);
    selectPageCard(null);
  }

  return (
    <div className="app">
      <main className="app__main">
        <PageStack
          currentPage={currentPage}
          selectedPageCardId={selectedPageCardId}
          editingPageCardId={editingPageCardId}
          onSelectPageCard={selectPageCard}
          onRequestEditPageCard={requestEditPageCard}
          onChangeDraft={handleChangeDraft}
        />
      </main>

      <PageNav
        canNavigateUp={canNavigateUp}
        canNavigateDown={canNavigateDown}
        onNavigateUp={navigateUp}
        onNavigateDown={navigateDown}
        onAddPage={handleAddPageAtBottom}
      />

      <Dock
        selected={selectedPageCard}
        selectedPage={selectedPageForDock}
        generating={generating}
        streamingText={generating ? generation.text : ""}
        onEdit={() => setIsEditing(true)}
        onSave={handleSave}
        onRemoveFromPage={handleRemoveFromPage}
        onDeleteEntirely={handleDeleteEntirely}
        onGenerate={handleGenerate}
        onAddCardToPage={handleAddCardToCurrentPage}
        onDeletePage={handleDeleteCurrentPage}
        vaultCards={vault.cards}
        vaultQuery={vault.query}
        onVaultQueryChange={vault.setQuery}
        onCreateCardInPage={currentPage ? () => handleCreateCardInVault(currentPage.id) : null}
        onDeleteVaultCard={vault.deleteCard}
        onAddVaultCardToPage={
          currentPage ? (cardId) => openCardIntoPage(currentPage.id, cardId) : null
        }
      />
    </div>
  );
}

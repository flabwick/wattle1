import { useMemo, useState } from "react";
import { Dock } from "./components/Dock/Dock.js";
import { PageStack } from "./components/PageStack/PageStack.js";
import * as api from "./api/client.js";
import { usePages } from "./hooks/usePages.js";
import { useVault } from "./hooks/useVault.js";
import { useGeneration } from "./hooks/useGeneration.js";
import { t } from "./i18n/index.js";

export function App() {
  const [selectedPageCardId, setSelectedPageCardId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const { pages, addPage, removePage, createCardInPage, openCardIntoPage, generate, refresh } =
    usePages();
  const vault = useVault();
  const generation = useGeneration();

  const selectedPageCard = useMemo(
    () =>
      pages.flatMap((p) => p.pageCards).find((pc) => pc.id === selectedPageCardId) ?? null,
    [pages, selectedPageCardId],
  );

  const topPageId = useMemo(
    () => (pages.length ? [...pages].sort((a, b) => b.order - a.order)[0].id : null),
    [pages],
  );

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
    setSelectedPageCardId(null);
    await api.removePageCardFromPage(selectedPageCard.id);
    await refresh();
  }

  async function handleDeleteEntirely() {
    if (!selectedPageCard) return;
    setSelectedPageCardId(null);
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

  return (
    <div className="app">
      <main className="app__main">
        <PageStack
          pages={pages}
          selectedPageCardId={selectedPageCardId}
          onSelectPageCard={setSelectedPageCardId}
          onAddPage={addPage}
          onRemovePage={removePage}
          onCreateCardInPage={(pageId) => createCardInPage(pageId, t("common.untitled"), "")}
          onChangeDraft={handleChangeDraft}
        />
      </main>

      <Dock
        selected={selectedPageCard}
        generating={generating}
        streamingText={generating ? generation.text : ""}
        onSave={handleSave}
        onRemoveFromPage={handleRemoveFromPage}
        onDeleteEntirely={handleDeleteEntirely}
        onGenerate={handleGenerate}
        vaultCards={vault.cards}
        vaultQuery={vault.query}
        onVaultQueryChange={vault.setQuery}
        onCreateVaultCard={vault.createCard}
        onDeleteVaultCard={vault.deleteCard}
        onAddVaultCardToPage={topPageId ? (cardId) => openCardIntoPage(topPageId, cardId) : null}
      />
    </div>
  );
}

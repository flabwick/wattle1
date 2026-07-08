import { useMemo, useState } from "react";
import { Dock } from "./components/Dock/Dock.js";
import { PageStack } from "./components/PageStack/PageStack.js";
import { VaultView } from "./components/Vault/VaultView.js";
import * as api from "./api/client.js";
import { usePages } from "./hooks/usePages.js";
import { useVault } from "./hooks/useVault.js";

type Tab = "pages" | "vault";

export function App() {
  const [tab, setTab] = useState<Tab>("pages");
  const [selectedPageCardId, setSelectedPageCardId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const { pages, addPage, removePage, createCardInPage, openCardIntoPage, generate, refresh } =
    usePages();
  const vault = useVault();

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

  async function handleChangeDraft(draft: { title?: string; content?: string }) {
    if (!selectedPageCard) return;
    await api.updatePageCardDraft(selectedPageCard.id, draft);
    await refresh();
  }

  return (
    <div className="app">
      <nav className="app__tabs">
        <button
          type="button"
          className={tab === "pages" ? "app__tab app__tab--active" : "app__tab"}
          onClick={() => setTab("pages")}
        >
          Pages
        </button>
        <button
          type="button"
          className={tab === "vault" ? "app__tab app__tab--active" : "app__tab"}
          onClick={() => setTab("vault")}
        >
          Vault
        </button>
      </nav>

      <main className="app__main">
        {tab === "pages" ? (
          <PageStack
            pages={pages}
            selectedPageCardId={selectedPageCardId}
            onSelectPageCard={setSelectedPageCardId}
            onAddPage={addPage}
            onRemovePage={removePage}
            onCreateCardInPage={(pageId) => createCardInPage(pageId, "Untitled", "")}
          />
        ) : (
          <VaultView
            cards={vault.cards}
            query={vault.query}
            onQueryChange={vault.setQuery}
            onCreateCard={vault.createCard}
            onDeleteCard={vault.deleteCard}
            onOpenIntoTopPage={
              topPageId ? (cardId) => openCardIntoPage(topPageId, cardId) : null
            }
          />
        )}
      </main>

      {tab === "pages" && (
        <Dock
          selected={selectedPageCard}
          generating={generating}
          onChangeDraft={handleChangeDraft}
          onSave={handleSave}
          onRemoveFromPage={handleRemoveFromPage}
          onDeleteEntirely={handleDeleteEntirely}
          onGenerate={handleGenerate}
        />
      )}
    </div>
  );
}

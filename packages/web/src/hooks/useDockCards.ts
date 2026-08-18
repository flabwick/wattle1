import { useCallback, useEffect, useState } from "react";
import type { DockCardWithCard } from "@wattle/shared";
import * as api from "../api/client.js";
import { publishCard, subscribeToSaves } from "../lib/cardStore.js";

/** Loads and refreshes the Dock's persistent scratchpad layer (Step 6 spec §1.2) —
 *  Cards that live outside every Page/Tab, always shown in the Dock's horizontal
 *  scroll row regardless of what's currently selected/navigated. */
export function useDockCards() {
  const [dockCards, setDockCards] = useState<DockCardWithCard[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await api.listDockCards();
    setDockCards(next);
    setLoading(false);
    // Same convention as usePages.ts/useVault.ts: publish every Card this fetch sees
    // so a Dock Card rendered elsewhere (CardEmbed.tsx/useCard.ts) as an embed stays
    // in sync with edits made through the Dock Card panel, and vice versa.
    for (const dockCard of next) {
      publishCard(dockCard.card);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A Dock Card writes straight through to its Card row (no draft step, same as an
  // embed) — pick up saves made elsewhere (e.g. the Vault panel editing the same
  // underlying Card) without waiting for some other refresh to happen to fire.
  useEffect(() => subscribeToSaves(() => refresh()), [refresh]);

  const addExistingCard = useCallback(
    async (cardId: string) => {
      const dockCard = await api.addExistingCardToDock(cardId);
      await refresh();
      return dockCard;
    },
    [refresh],
  );

  const createCard = useCallback(
    async (title: string, content: string) => {
      const dockCard = await api.createCardInDock(title, content);
      await refresh();
      return dockCard;
    },
    [refresh],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      const dockCard = await api.uploadFileToDock(file);
      await refresh();
      return dockCard;
    },
    [refresh],
  );

  const removeDockCard = useCallback(
    async (id: string) => {
      await api.removeDockCard(id);
      await refresh();
    },
    [refresh],
  );

  const moveToPage = useCallback(
    async (dockCardId: string, pageId: string, destIndex: number) => {
      await api.moveDockCardToPage(dockCardId, pageId, destIndex);
      await refresh();
    },
    [refresh],
  );

  const convertToStack = useCallback(
    async (dockCardId: string) => {
      const result = await api.convertDockCardToStack(dockCardId);
      await refresh();
      return result;
    },
    [refresh],
  );

  return {
    dockCards,
    loading,
    refresh,
    addExistingCard,
    createCard,
    uploadFile,
    removeDockCard,
    moveToPage,
    convertToStack,
  };
}

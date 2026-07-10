import { useCallback, useEffect, useState } from "react";
import type { Card } from "@wattle/shared";
import * as api from "../api/client.js";
import { publishCard, subscribeToSaves } from "../lib/cardStore.js";

/** The flat, searchable vault list (spec1.md Part 3 "Vault"). */
export function useVault() {
  const [cards, setCards] = useState<Card[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (q?: string) => {
    setLoading(true);
    const next = await api.listCards(q);
    setCards(next);
    setLoading(false);
    // Every Card this fetch sees is the vault's current source of truth for it —
    // publish each into the shared cardStore so any mounted embed of the same id
    // picks up changes made through the Vault panel, same as usePages.ts's refresh().
    for (const card of next) {
      publishCard(card);
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => refresh(query || undefined), 200);
    return () => clearTimeout(handle);
  }, [query, refresh]);

  // A Card saved anywhere else (the top-level Save action in App.tsx, or an embed
  // edited in place) durably lands in the vault without this panel's own debounced
  // timer knowing about it. Refresh on every such save so the list — and any Card
  // content shown within it — catches up immediately instead of waiting up to 200ms
  // for unrelated query-driven polling, or going stale indefinitely if the query
  // never changes.
  useEffect(() => subscribeToSaves(() => refresh(query || undefined)), [refresh, query]);

  const deleteCard = useCallback(
    async (id: string) => {
      setCards((prev) => prev.filter((c) => c.id !== id));
      await api.deleteCard(id);
    },
    [],
  );

  return { cards, loading, query, setQuery, deleteCard, refresh };
}

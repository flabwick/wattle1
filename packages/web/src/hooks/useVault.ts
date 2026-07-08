import { useCallback, useEffect, useState } from "react";
import type { Card } from "@wattle/shared";
import * as api from "../api/client.js";

/** The flat, searchable vault list (spec1.md Part 3 "Vault"). */
export function useVault() {
  const [cards, setCards] = useState<Card[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (q?: string) => {
    setLoading(true);
    setCards(await api.listCards(q));
    setLoading(false);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => refresh(query || undefined), 200);
    return () => clearTimeout(handle);
  }, [query, refresh]);

  const createCard = useCallback(
    async (title: string, content: string) => {
      await api.createCard({ title, content });
      await refresh(query || undefined);
    },
    [query, refresh],
  );

  const deleteCard = useCallback(
    async (id: string) => {
      setCards((prev) => prev.filter((c) => c.id !== id));
      await api.deleteCard(id);
    },
    [],
  );

  return { cards, loading, query, setQuery, createCard, deleteCard, refresh };
}

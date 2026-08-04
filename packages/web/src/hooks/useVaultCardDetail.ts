import { useEffect, useState } from "react";
import type { Card, NearbyItem } from "@wattle/shared";
import { findEmbeddedCardIds, htmlToDoc } from "@wattle/shared";
import * as api from "../api/client.js";

export interface VaultCardLink {
  cardId: string;
  title: string;
}

/**
 * Feeds the Vault panel's click-through card view (VaultCardDetail.tsx): the Card
 * itself, every Card it links to or embeds (metadata.links unioned with whatever
 * cardEmbed nodes its own content carries — the same "durable tie" sources
 * proximityService.ts reinforces server-side), and its durable Nearby list. Refetches
 * whenever `cardId` changes, including when a link/Nearby row is clicked to drill in.
 */
export function useVaultCardDetail(cardId: string | null) {
  const [card, setCard] = useState<Card | null>(null);
  const [links, setLinks] = useState<VaultCardLink[]>([]);
  const [nearbyItems, setNearbyItems] = useState<NearbyItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cardId) {
      setCard(null);
      setLinks([]);
      setNearbyItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const loadedCard = await api.getCard(cardId);
      if (cancelled) return;
      setCard(loadedCard);

      const embeddedIds = findEmbeddedCardIds(htmlToDoc(loadedCard.content));
      const linkedIds = [...new Set([...embeddedIds, ...loadedCard.metadata.links])].filter(
        (id) => id !== cardId,
      );
      const [linkedCards, durable] = await Promise.all([
        Promise.all(
          linkedIds.map(async (id) => {
            try {
              return await api.getCard(id);
            } catch {
              // A link/embed can point at a Card that's since been deleted — silently
              // drop it, same "don't fail over a dangling reference" convention
              // generationService.ts's resolveInstructionEmbeds already uses.
              return null;
            }
          }),
        ),
        api.getDurableNearby(cardId),
      ]);
      if (cancelled) return;
      setLinks(
        linkedCards
          .filter((c): c is Card => c !== null)
          .map((c) => ({ cardId: c.id, title: c.title })),
      );
      setNearbyItems(durable);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  return { card, links, nearbyItems, loading };
}

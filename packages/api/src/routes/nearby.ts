import { Router } from "express";
import type { NearbyItem } from "@wattle/shared";
import * as proximityService from "../services/proximityService.js";
import * as nearbyService from "../services/nearbyService.js";
import { prisma } from "../db.js";

// Mounted at /api/nearby — the Wattle vault plan's Nearby system: a durable proximity
// graph (proximityService.ts) plus a live re-rank against what's open/typed
// (nearbyService.ts).
export const nearbyRouter = Router();

function summaryOrTitle(card: { title: string; metadata: string }): string {
  try {
    const metadata = JSON.parse(card.metadata) as { summary?: string };
    return metadata.summary?.trim() || card.title;
  } catch {
    return card.title;
  }
}

// GET /api/nearby/durable/:cardId?limit=8 — a Card's durable Nearby list, decayed and
// sorted descending, for the vault's own Nearby panel.
nearbyRouter.get("/durable/:cardId", async (req, res) => {
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 8;
  const results = await proximityService.getDurableNearby(req.params.cardId, Number.isFinite(limit) ? limit : 8);
  const cards = await prisma.card.findMany({ where: { id: { in: results.map((r) => r.cardId) } } });
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const items: NearbyItem[] = results
    .map((r) => {
      const card = cardsById.get(r.cardId);
      if (!card) return null;
      return { cardId: r.cardId, title: card.title, summary: summaryOrTitle(card), score: r.score };
    })
    .filter((item): item is NearbyItem => item !== null);
  res.json(items);
});

// POST /api/nearby/live  { pageId, focusedCardId?, draftText?, limit? } — the live
// re-rank against what's open on the Page and what's currently being typed.
nearbyRouter.post("/live", async (req, res) => {
  const { pageId, focusedCardId, draftText, limit } = req.body ?? {};
  if (typeof pageId !== "string") {
    return res.status(400).json({ error: "pageId is required" });
  }
  res.json(
    await nearbyService.getLiveNearby({
      pageId,
      focusedCardId: typeof focusedCardId === "string" ? focusedCardId : undefined,
      draftText: typeof draftText === "string" ? draftText : undefined,
      limit: typeof limit === "number" ? limit : undefined,
    }),
  );
});

import type { Card } from "@wattle/shared";
import { findEmbeddedCardIds, htmlToDoc } from "@wattle/shared";
import { prisma } from "../db.js";

/**
 * Wattle vault plan's "durable map" — a decaying proximity graph between Cards,
 * reinforced by Page co-presence, embeds/regular links, and forks. Read (with decay
 * applied) by nearbyService.ts for the live re-rank, and eventually by the vault's own
 * Nearby panel for a Card's durable list.
 */

/** How much one Page co-presence pass between two adjacent Cards is worth — a single
 *  reinforcement here is meant to be a soft signal, easily outweighed by a real link. */
const COPRESENCE_WEIGHT = 1;
/** An embed, a regular `metadata.links` reference, or a fork tie — a deliberate action,
 *  not just two Cards happening to sit on the same Page, so it's reinforced far more
 *  strongly than one co-presence pass. */
const LINK_WEIGHT = 8;
/** Ties saturate here rather than growing unbounded — an old, constantly-revisited pair
 *  shouldn't crowd out every other signal just by virtue of being touched often. */
const MAX_SCORE = 100;
/** Read-time exponential decay half-life — see decayedScore below. Unused ties fade
 *  over roughly this many days so old drafts don't dominate Nearby forever, without
 *  needing a cron job to rewrite scores in the background. */
const HALF_LIFE_DAYS = 30;

function pairKey(cardAId: string, cardBId: string): [string, string] {
  return cardAId < cardBId ? [cardAId, cardBId] : [cardBId, cardAId];
}

/** Reinforces the durable tie between two Cards by `weight`, saturating at MAX_SCORE.
 *  A no-op if the two ids are equal (a Card is never "near" itself). */
export async function reinforcePair(cardAId: string, cardBId: string, weight: number): Promise<void> {
  if (cardAId === cardBId) return;
  const [a, b] = pairKey(cardAId, cardBId);
  const existing = await prisma.cardProximity.findUnique({
    where: { cardAId_cardBId: { cardAId: a, cardBId: b } },
  });
  const nextScore = Math.min(MAX_SCORE, (existing?.score ?? 0) + weight);
  await prisma.cardProximity.upsert({
    where: { cardAId_cardBId: { cardAId: a, cardBId: b } },
    create: { cardAId: a, cardBId: b, score: nextScore },
    update: { score: nextScore },
  });
}

/** Reinforces every pair of *savedToVault* Cards on a Page, weighted inversely by how
 *  far apart they sit in stack order — adjacent Cards tie harder than far-apart ones
 *  (Wattle vault plan's "Cards near each other in stack order... stronger than Cards
 *  far apart"). Still-unsaved page-local scratch Cards are excluded so drafting churn
 *  doesn't pollute the durable graph before there's anything real to point at. Called
 *  from pageCardService.ts whenever a Page's PageCard membership or order changes. */
export async function reinforcePageCoPresence(pageId: string): Promise<void> {
  const pageCards = await prisma.pageCard.findMany({
    where: { pageId, card: { savedToVault: true } },
    orderBy: { order: "asc" },
    select: { cardId: true, order: true },
  });
  for (let i = 0; i < pageCards.length; i++) {
    for (let j = i + 1; j < pageCards.length; j++) {
      const distance = pageCards[j].order - pageCards[i].order;
      const weight = COPRESENCE_WEIGHT / (1 + distance);
      await reinforcePair(pageCards[i].cardId, pageCards[j].cardId, weight);
    }
  }
}

/** Reinforces a strong tie for every Card `card` embeds or links to (embeds detected
 *  from its own HTML content via the same `findEmbeddedCardIds` generationService.ts
 *  uses; `metadata.links` are user/generation-declared ids) — Wattle vault plan's
 *  "Embed or regular link -> Strong lasting tie". Only meaningful once `card` is
 *  itself a real vault entry, so callers should only invoke this for a savedToVault
 *  Card (pageCardService.saveToVault, cardEdit.ts). */
export async function reinforceContentLinks(card: Pick<Card, "id" | "content" | "metadata">): Promise<void> {
  const embeddedIds = findEmbeddedCardIds(htmlToDoc(card.content));
  const targetIds = new Set([...embeddedIds, ...card.metadata.links]);
  for (const targetId of targetIds) {
    await reinforcePair(card.id, targetId, LINK_WEIGHT);
  }
}

/** Reinforces the lineage tie between a Frozen Card and a fork made from it
 *  (cardService.ts's forkCard). */
export async function reinforceFork(originalId: string, forkId: string): Promise<void> {
  await reinforcePair(originalId, forkId, LINK_WEIGHT);
}

/** Exponential decay applied at read time only — nothing ever rewrites a decayed value
 *  back to the DB, so unused ties fade "live" without a background job. */
export function decayedScore(score: number, lastReinforcedAt: Date): number {
  const ageDays = (Date.now() - lastReinforcedAt.getTime()) / (1000 * 60 * 60 * 24);
  return score * Math.exp(-ageDays / HALF_LIFE_DAYS);
}

export interface DurableNearbyResult {
  cardId: string;
  score: number;
}

/** The durable Nearby list for one Card: every other Card it has a proximity row
 *  with, decayed and sorted descending. */
export async function getDurableNearby(cardId: string, limit: number): Promise<DurableNearbyResult[]> {
  const rows = await prisma.cardProximity.findMany({
    where: { OR: [{ cardAId: cardId }, { cardBId: cardId }] },
  });
  return rows
    .map((row) => ({
      cardId: row.cardAId === cardId ? row.cardBId : row.cardAId,
      score: decayedScore(row.score, row.lastReinforcedAt),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

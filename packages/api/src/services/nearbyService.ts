import type { NearbyItem } from "@wattle/shared";
import { flattenToPlainText, htmlToDoc } from "@wattle/shared";
import { prisma } from "../db.js";
import * as proximityService from "./proximityService.js";

/**
 * Wattle vault plan's "live rank" — re-scores the durable proximity graph against
 * whatever's open on the current Page and whatever's currently being typed, using a
 * local token-overlap heuristic (your call over external embeddings — see the plan).
 * Pure/synchronous: no model call, cheap enough to hit on every debounced keystroke.
 */

/** How many of a focused/open Card's durable ties to pull as live-rank candidates —
 *  kept small since this whole pass is meant to be cheap, not an exhaustive graph
 *  walk. */
const CANDIDATE_POOL_SIZE = 40;
const DEFAULT_LIMIT = 8;

// A tiny, deliberately short stoplist — this is a cheap relevance nudge, not a real
// NLP pipeline, so it only needs to strip the handful of words common enough to drown
// out every genuine overlap signal.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with", "is",
  "are", "was", "were", "be", "been", "this", "that", "it", "as", "at", "by", "from",
  "not", "no", "so", "if", "then", "than", "too", "very", "can", "will", "just",
]);

function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

/** |intersection| / sqrt(|a| * |b|) over token sets — a cosine-similarity-shaped
 *  score without needing real vectors. 0 whenever either side is empty. */
function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  return intersection / Math.sqrt(a.size * b.size);
}

function summaryOrTitle(card: { title: string; metadata: string }): string {
  try {
    const metadata = JSON.parse(card.metadata) as { summary?: string };
    return metadata.summary?.trim() || card.title;
  } catch {
    return card.title;
  }
}

export interface LiveNearbyInput {
  pageId: string;
  /** The Card currently in focus (editing/fullscreen), if any — narrows the durable
   *  candidate pool to its own ties instead of every open Card's. */
  focusedCardId?: string;
  /** Whatever's currently being typed (title + content) in the focused Card, if
   *  it's mid-edit — folded into the query text alongside open Cards' summaries. */
  draftText?: string;
  limit?: number;
}

/** The live Nearby list for one Page "moment": durable candidates re-scored against
 *  what's open on the Page plus what's being typed right now. */
export async function getLiveNearby(input: LiveNearbyInput): Promise<NearbyItem[]> {
  const limit = input.limit ?? DEFAULT_LIMIT;

  const openPageCards = await prisma.pageCard.findMany({
    where: { pageId: input.pageId, card: { savedToVault: true } },
    include: { card: true },
  });
  const openCardIds = new Set(openPageCards.map((pc) => pc.cardId));
  if (openCardIds.size === 0 && !input.focusedCardId) return [];

  const queryTextParts = [input.draftText ?? ""];
  for (const pc of openPageCards) {
    if (pc.cardId === input.focusedCardId) continue;
    queryTextParts.push(summaryOrTitle(pc.card));
  }
  const queryTokens = tokenize(queryTextParts.join(" "));

  const durableSources = input.focusedCardId ? [input.focusedCardId] : [...openCardIds];
  const candidateScores = new Map<string, number>();
  for (const sourceId of durableSources) {
    const durable = await proximityService.getDurableNearby(sourceId, CANDIDATE_POOL_SIZE);
    for (const { cardId, score } of durable) {
      if (openCardIds.has(cardId)) continue;
      candidateScores.set(cardId, Math.max(candidateScores.get(cardId) ?? 0, score));
    }
  }
  if (candidateScores.size === 0) return [];

  const maxDurableScore = Math.max(...candidateScores.values(), 1);
  const candidates = await prisma.card.findMany({
    where: { id: { in: [...candidateScores.keys()] }, savedToVault: true },
  });

  return candidates
    .map((card) => {
      const durableScore = (candidateScores.get(card.id) ?? 0) / maxDurableScore;
      const summary = summaryOrTitle(card);
      const textScore = overlapScore(tokenize(summary), queryTokens);
      return {
        cardId: card.id,
        title: card.title,
        summary,
        score: 0.4 * durableScore + 0.6 * textScore,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

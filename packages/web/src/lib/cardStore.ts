import type { Card } from "@wattle/shared";
import { getCard as fetchCard, updateCard as patchCard } from "../api/client.js";

/**
 * A single shared cache of vault Cards, keyed by id — the thing that makes "the same
 * Card opened on one Page and embedded in another" (or embedded twice) actually be
 * *one* live view of the vault's source of truth rather than several independent
 * copies. Every CardEmbed (CardEmbed.tsx, via useCard.ts) reads and writes through
 * here instead of holding its own local `useState`, so editing any one instance —
 * or saving a top-level PageCard back to the vault (usePages.ts's refresh(), which
 * publishes every Card it fetches here) — is immediately visible in every other
 * currently-mounted instance of that same Card, no page reload or manual refetch
 * needed.
 *
 * Deliberately a plain module-level singleton, not React context: there's only ever
 * one of these per page load, nothing about it is scoped per-component-tree, and it
 * needs to be reachable from usePages.ts (which mounts once, outside any Card) just
 * as easily as from CardEmbed (which can mount many times for the same id).
 */

type Listener = () => void;

const cache = new Map<string, Card>();
const listeners = new Map<string, Set<Listener>>();
const inflightFetches = new Map<string, Promise<Card>>();

/** Per-cardId write queue, same coalescing shape as App.tsx's draft-save queue and
 *  for the same reason: without it, two overlapping PATCHes for the same Card (e.g.
 *  fast typing in an embed) can be applied by the server out of order, silently
 *  reverting the later one. At most one PATCH per cardId is ever in flight; further
 *  edits that arrive while one is in flight get merged into `pending` and sent as a
 *  single follow-up request once it resolves. */
const writeInFlight = new Set<string>();
const writePending = new Map<string, { title?: string; content?: string }>();

/** Notified whenever a write durably lands on the server (as opposed to the
 *  optimistic local patch, which fires immediately) — usePages.ts subscribes so a
 *  Card edited through an embed also refreshes any top-level PageCard views of that
 *  same Card, not just other embeds. */
const savedListeners = new Set<(cardId: string) => void>();

function notify(cardId: string) {
  listeners.get(cardId)?.forEach((l) => l());
}

export function getCachedCard(cardId: string): Card | undefined {
  return cache.get(cardId);
}

export function subscribeToCard(cardId: string, listener: Listener): () => void {
  let set = listeners.get(cardId);
  if (!set) {
    set = new Set();
    listeners.set(cardId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
  };
}

export function subscribeToSaves(listener: (cardId: string) => void): () => void {
  savedListeners.add(listener);
  return () => savedListeners.delete(listener);
}

/** Publishes a Card fetched or saved elsewhere (usePages.ts's refresh(), which sees
 *  every Card via GET /api/pages) into the shared cache, so any mounted CardEmbed of
 *  the same id picks it up immediately instead of only on its own next fetch. A
 *  no-op if that cardId has a write in flight right now — that write's own eventual
 *  server response is the more current value; overwriting it with a possibly
 *  slightly-stale concurrent GET's copy would just re-introduce the same
 *  out-of-order-write problem `writeInFlight` exists to prevent. */
export function publishCard(card: Card): void {
  if (writeInFlight.has(card.id)) return;
  cache.set(card.id, card);
  notify(card.id);
}

/** Ensures the cache has (or is fetching) cardId's Card. Multiple simultaneous
 *  mounts of an embed for the same id share one in-flight request rather than each
 *  firing their own. */
export function ensureCardLoaded(cardId: string): Promise<Card> {
  const cached = cache.get(cardId);
  if (cached) return Promise.resolve(cached);
  const inflight = inflightFetches.get(cardId);
  if (inflight) return inflight;
  const promise = fetchCard(cardId)
    .then((card) => {
      cache.set(cardId, card);
      inflightFetches.delete(cardId);
      notify(cardId);
      return card;
    })
    .catch((err) => {
      inflightFetches.delete(cardId);
      throw err;
    });
  inflightFetches.set(cardId, promise);
  return promise;
}

async function flushWrite(cardId: string) {
  const next = writePending.get(cardId);
  if (!next) return;
  writePending.delete(cardId);
  writeInFlight.add(cardId);
  try {
    const saved = await patchCard(cardId, next);
    cache.set(cardId, saved);
    notify(cardId);
    savedListeners.forEach((l) => l(cardId));
  } catch {
    /* best-effort — same fire-and-forget convention the rest of the app's draft
       edits use; the optimistic cache entry set in editCard below stands as-is. */
  } finally {
    writeInFlight.delete(cardId);
    if (writePending.has(cardId)) {
      await flushWrite(cardId);
    }
  }
}

/** Edits a vault Card directly — no page-local draft/Save step the way a PageCard
 *  has, since an embed isn't "in" any one Page. Updates the shared cache immediately
 *  (every mounted view of this Card re-renders with the new value right away) and
 *  queues the PATCH, coalesced per cardId. */
export function editCard(cardId: string, patch: { title?: string; content?: string }): void {
  const current = cache.get(cardId);
  if (current) {
    cache.set(cardId, { ...current, ...patch });
    notify(cardId);
  }
  writePending.set(cardId, { ...writePending.get(cardId), ...patch });
  if (!writeInFlight.has(cardId)) {
    flushWrite(cardId);
  }
}

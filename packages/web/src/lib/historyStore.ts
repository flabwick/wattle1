import type { HistoryEntry, HistoryScope } from "@wattle/shared";
import { getHistory } from "../api/client.js";

/**
 * A shared per-Page cache of the full state system's history log (see
 * historyService.ts on the API side) — same subscribe/cache/publish shape as
 * cardStore.ts, for the same reason: useHistory.ts (Dock's Undo/Redo/Back/Forward)
 * and useEditHistoryRecorder.ts both need the current log without each holding an
 * independent copy or re-fetching on every render.
 */

type Listener = () => void;

const cache = new Map<string, HistoryEntry[]>();
const listeners = new Map<string, Set<Listener>>();
const inflightFetches = new Map<string, Promise<HistoryEntry[]>>();

function notify(pageId: string) {
  listeners.get(pageId)?.forEach((l) => l());
}

export function getCachedHistory(pageId: string): HistoryEntry[] | undefined {
  return cache.get(pageId);
}

export function subscribeToHistory(pageId: string, listener: Listener): () => void {
  let set = listeners.get(pageId);
  if (!set) {
    set = new Set();
    listeners.set(pageId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
  };
}

/** Ensures the cache has (or is fetching) pageId's log. Doesn't re-fetch once
 *  loaded — the log only ever changes through this module's own applyEntry (every
 *  write path — record/undo/redo/back/forward — goes through useHistory.ts, which
 *  always calls applyEntry with the server's response), so there's nothing else
 *  that could make the cache stale. */
export function ensureHistoryLoaded(pageId: string): Promise<HistoryEntry[]> {
  const cached = cache.get(pageId);
  if (cached) return Promise.resolve(cached);
  const inflight = inflightFetches.get(pageId);
  if (inflight) return inflight;
  const promise = getHistory(pageId)
    .then((entries) => {
      cache.set(pageId, entries);
      inflightFetches.delete(pageId);
      notify(pageId);
      return entries;
    })
    .catch((err) => {
      inflightFetches.delete(pageId);
      throw err;
    });
  inflightFetches.set(pageId, promise);
  return promise;
}

/** Upserts one entry (a fresh record, or an undo/redo/back/forward's now-updated
 *  row) into pageId's cached log, in createdAt order — the write half of every
 *  history mutation, called by useHistory.ts right after the API responds so
 *  canUndo/canRedo/canGoBack/canGoForward and the log itself update without a full
 *  re-fetch. */
export function applyEntry(pageId: string, entry: HistoryEntry): void {
  const current = cache.get(pageId) ?? [];
  const next = current.some((e) => e.id === entry.id)
    ? current.map((e) => (e.id === entry.id ? entry : e))
    : [...current, entry].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  cache.set(pageId, next);
  notify(pageId);
}

/** Whether `entryCardIds` (an entry's own recorded target/selection) is a subset of
 *  `scope` — mirrors historyService.ts's matchesScope exactly (including the
 *  empty-cardIds special case there); kept duplicated (not imported — this is a
 *  browser bundle, the API package isn't) the same way useGeneration.ts's own doc
 *  comment explains for CardBlockParser events. */
function matchesScope(entryCardIds: string[], scope: HistoryScope): boolean {
  if (scope === "page") return true;
  if (entryCardIds.length === 0) return false;
  const scopeSet = new Set(scope);
  return entryCardIds.every((id) => scopeSet.has(id));
}

function filtered(entries: HistoryEntry[], kind: "edit" | "generation", scope: HistoryScope): HistoryEntry[] {
  return entries.filter((e) => e.kind === kind && matchesScope(e.cardIds, scope));
}

export function canUndo(entries: HistoryEntry[], scope: HistoryScope): boolean {
  return filtered(entries, "edit", scope).some((e) => !e.undoneAt);
}

export function canRedo(entries: HistoryEntry[], scope: HistoryScope): boolean {
  return filtered(entries, "edit", scope).some((e) => e.undoneAt);
}

export function canGoBack(entries: HistoryEntry[], scope: HistoryScope): boolean {
  return filtered(entries, "generation", scope).some((e) => !e.undoneAt);
}

export function canGoForward(entries: HistoryEntry[], scope: HistoryScope): boolean {
  return filtered(entries, "generation", scope).some((e) => e.undoneAt);
}

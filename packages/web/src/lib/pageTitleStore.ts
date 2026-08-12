import { getPage } from "../api/client.js";

/**
 * A small shared cache of Page titles, keyed by id — what lets a `pageLink` chip
 * (PageLinkNodeView.tsx) show the target Page's *current* title rather than the
 * stale snapshot cached in its own stored `data-title` attribute at insert time.
 * Same "plain module-level singleton, published into by every full Page fetch"
 * shape as cardStore.ts, scaled down to just the one field a chip actually needs.
 *
 * Publishing happens two ways: usePage.ts's own refresh() publishes the title of
 * whichever Page is currently in view (so renaming it — which calls that same
 * refresh() — is instantly visible to every other mounted chip pointing at it, no
 * reload needed), and ensurePageTitleFetched below lazily fetches any Page a chip
 * references that hasn't been loaded this session at all.
 */

type Listener = () => void;

const cache = new Map<string, string | null>();
const listeners = new Map<string, Set<Listener>>();
const inflightFetches = new Map<string, Promise<void>>();

function notify(pageId: string) {
  listeners.get(pageId)?.forEach((l) => l());
}

export function getCachedPageTitle(pageId: string): string | null | undefined {
  return cache.get(pageId);
}

export function subscribeToPageTitle(pageId: string, listener: Listener): () => void {
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

/** Publishes a Page's current title — called with every Page a full fetch (GET
 *  .../pages/:id) returns, wherever that happens. */
export function publishPageTitle(pageId: string, title: string | null): void {
  if (cache.get(pageId) === title && cache.has(pageId)) return;
  cache.set(pageId, title);
  notify(pageId);
}

/** Fetches pageId's title if nothing (or nothing in flight) already has it — a
 *  chip for a Page that hasn't been opened/renamed this session yet has no other
 *  way to learn its title. Several simultaneous chips for the same id share one
 *  request, same convention as cardStore.ts's ensureCardLoaded. */
export function ensurePageTitleFetched(pageId: string): void {
  if (cache.has(pageId) || inflightFetches.has(pageId)) return;
  const promise = getPage(pageId)
    .then((page) => {
      publishPageTitle(pageId, page.title);
    })
    .catch(() => {})
    .finally(() => {
      inflightFetches.delete(pageId);
    });
  inflightFetches.set(pageId, promise);
}

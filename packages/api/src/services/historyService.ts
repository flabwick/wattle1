import type { HistoryEntry, HistoryScope, PageCardSnapshot } from "@wattle/shared";
import { cardMetadataV1Schema, defaultMetadata } from "@wattle/shared";
import { prisma } from "../db.js";

type HistoryEntryRow = {
  id: string;
  pageId: string;
  kind: string;
  label: string;
  cardIds: string;
  before: string;
  after: string;
  undoneAt: Date | null;
  createdAt: Date;
};

function serialize(row: HistoryEntryRow): HistoryEntry {
  return {
    id: row.id,
    pageId: row.pageId,
    kind: row.kind === "generation" ? "generation" : "edit",
    label: row.label,
    cardIds: JSON.parse(row.cardIds) as string[],
    before: JSON.parse(row.before) as PageCardSnapshot[],
    after: JSON.parse(row.after) as PageCardSnapshot[],
    undoneAt: row.undoneAt ? row.undoneAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Whether `entryCardIds` (an entry's own recorded target/selection) is a subset of
 *  `scope` — "page" always matches (the page-wide view sees every entry regardless
 *  of which cards it touched). An entry with no cardIds at all is page-only (never
 *  surfaces in a card-scoped view) rather than vacuously matching every scope — the
 *  empty-array `.every()` default would otherwise say the opposite. */
function matchesScope(entryCardIds: string[], scope: HistoryScope): boolean {
  if (scope === "page") return true;
  if (entryCardIds.length === 0) return false;
  const scopeSet = new Set(scope);
  return entryCardIds.every((id) => scopeSet.has(id));
}

/** Records one history entry — the sole write path for both the Dock's Undo/Redo
 *  ("edit") and Back/Forward ("generation") logs. Nothing is pruned here: redo
 *  eligibility is a pure query at read time (see redo/goForward below), so a fresh
 *  edit elsewhere on the Page never spuriously invalidates a different card's own
 *  independent redo — see the `undoneAt` doc comment in schema.prisma. */
export async function recordEntry(
  pageId: string,
  kind: "edit" | "generation",
  label: string,
  cardIds: string[],
  before: PageCardSnapshot[],
  after: PageCardSnapshot[],
): Promise<HistoryEntry> {
  const row = await prisma.historyEntry.create({
    data: {
      pageId,
      kind,
      label,
      cardIds: JSON.stringify(cardIds),
      before: JSON.stringify(before),
      after: JSON.stringify(after),
    },
  });
  return serialize(row);
}

/** Full chronological log for a Page — the client hydrates its historyStore cache
 *  from this once per Page load, then computes canUndo/canRedo/canGoBack/
 *  canGoForward locally by filtering per the current selection (see
 *  historyStore.ts), rather than round-tripping on every selection change. */
export async function listEntries(pageId: string): Promise<HistoryEntry[]> {
  const rows = await prisma.historyEntry.findMany({ where: { pageId }, orderBy: { createdAt: "asc" } });
  return rows.map(serialize);
}

/** Applies one entry's target snapshot (its `before` when undoing, `after` when
 *  redoing) against the live Page: upserts every PageCard/Card the target array
 *  lists, and deletes any PageCard the *other* (source) array lists but the target
 *  one doesn't — a structural removal. The underlying Card row is never deleted
 *  here, even when a PageCard placement is — matches pageCardService.removeFromPage's
 *  own "never silently destroy" convention; an undone-away Card just becomes
 *  orphaned from this Page, same as any other removal. (One accepted gap: if the
 *  Card row itself was hard-deleted, by cardService.deleteCard, since the snapshot
 *  was taken, this recreates it with the recorded id/title/content/metadata but not
 *  its savedToVault/frozenAt/forkedFromId — those aren't part of PageCardSnapshot.) */
async function restoreSnapshot(pageId: string, target: PageCardSnapshot[], source: PageCardSnapshot[]): Promise<void> {
  const targetIds = new Set(target.map((s) => s.pageCardId));
  const toRemove = source.filter((s) => !targetIds.has(s.pageCardId));

  await prisma.$transaction(async (tx) => {
    for (const snap of target) {
      const metadata = JSON.stringify(
        snap.metadata === undefined ? defaultMetadata() : cardMetadataV1Schema.parse(snap.metadata),
      );
      await tx.card.upsert({
        where: { id: snap.cardId },
        create: { id: snap.cardId, title: snap.title, content: snap.content, metadata, savedToVault: true },
        update: { title: snap.title, content: snap.content, metadata },
      });
      await tx.pageCard.upsert({
        where: { id: snap.pageCardId },
        create: { id: snap.pageCardId, pageId, cardId: snap.cardId, order: snap.order },
        update: { cardId: snap.cardId, order: snap.order },
      });
    }
    for (const snap of toRemove) {
      await tx.pageCard.deleteMany({ where: { id: snap.pageCardId } });
    }
  });
}

/** Shared by undo/redo/back/forward: `direction: "undo"` finds the most recent
 *  active (non-undone) entry within `scope`+`kind` and applies its `before`;
 *  `"redo"` finds the entry within scope+kind with the latest `undoneAt` (see the
 *  comment further down for why that — not createdAt order — is the correct
 *  target) and applies its `after`. Filtering happens in JS (not SQL) since
 *  `cardIds` is a JSON string column and the whole per-Page log is small (a local,
 *  single-user app). */
async function step(
  pageId: string,
  kind: "edit" | "generation",
  scope: HistoryScope,
  direction: "undo" | "redo",
): Promise<HistoryEntry | null> {
  const rows = await prisma.historyEntry.findMany({
    where: { pageId, kind },
    orderBy: { createdAt: "asc" },
  });
  const entries = rows.map(serialize).filter((e) => matchesScope(e.cardIds, scope));

  if (direction === "undo") {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (!entries[i].undoneAt) {
        await restoreSnapshot(pageId, entries[i].before, entries[i].after);
        const updated = await prisma.historyEntry.update({
          where: { id: entries[i].id },
          data: { undoneAt: new Date() },
        });
        return serialize(updated);
      }
    }
    return null;
  }

  // redo: the entry with the *latest undoneAt* (wall-clock undo time), not the
  // latest createdAt — undo always pops whichever entry is currently the tip of its
  // own scope's active timeline, so within any single card's own entries undoneAt
  // is assigned in strictly reverse-createdAt order regardless of how interleaved
  // page-wide vs. card-scoped undo calls were; the most-recently-undone entry is
  // therefore always the correct next one to redo, in every scope.
  let candidate: HistoryEntry | null = null;
  for (const entry of entries) {
    if (!entry.undoneAt) continue;
    if (!candidate || entry.undoneAt > candidate.undoneAt!) candidate = entry;
  }
  if (!candidate) return null;
  await restoreSnapshot(pageId, candidate.after, candidate.before);
  const updated = await prisma.historyEntry.update({ where: { id: candidate.id }, data: { undoneAt: null } });
  return serialize(updated);
}

export function undo(pageId: string, scope: HistoryScope): Promise<HistoryEntry | null> {
  return step(pageId, "edit", scope, "undo");
}

export function redo(pageId: string, scope: HistoryScope): Promise<HistoryEntry | null> {
  return step(pageId, "edit", scope, "redo");
}

export function goBack(pageId: string, scope: HistoryScope): Promise<HistoryEntry | null> {
  return step(pageId, "generation", scope, "undo");
}

export function goForward(pageId: string, scope: HistoryScope): Promise<HistoryEntry | null> {
  return step(pageId, "generation", scope, "redo");
}

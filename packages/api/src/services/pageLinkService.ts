import type { Page } from "@wattle/shared";
import { findPageLinkIds, htmlToDoc } from "@wattle/shared";
import { prisma } from "../db.js";
import { serializePage } from "./pageService.js";

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The exact `<wattle-page-link>` tag shape `richText/pageLinkNode.ts` parses
 *  (`parseHTML`/`addAttributes` there) — the one place that knows how to spell one,
 *  so a caller building a link card (Homes + Pages hierarchy's "create child page")
 *  never hand-writes the tag itself. Escapes `title` — unlike
 *  `scripts/migrateTabsToHubs.ts`'s own one-time, already-run construction of the
 *  same tag, this is live code a user's own Page titles flow through. */
export function buildPageLinkHtml(pageId: string, title: string | null): string {
  return `<p><wattle-page-link data-page-id="${escapeHtml(pageId)}" data-title="${escapeHtml(title ?? "")}"></wattle-page-link></p>`;
}

/** The Page-link picker's "link to missing title → create empty Page, link to it"
 *  (Pages + Links + Search rebuild, Phase 2) — an exact, case-insensitive title match
 *  reuses the existing Page; otherwise a brand-new, untitled-no-longer Page is
 *  created on the spot so the link never dangles. Whitespace-trimmed both for the
 *  lookup and the created title, so "Roadmap" and " Roadmap " resolve to the same
 *  Page. `parentPageId`, when given, nests a freshly-created Page under it (ignored
 *  when an existing Page is reused — its own place in the hierarchy stands). */
export async function resolveOrCreatePageByTitle(rawTitle: string, parentPageId?: string): Promise<Page> {
  const title = rawTitle.trim();
  if (title === "") {
    throw new Error("A title is required to link to a Page");
  }
  const existing = await prisma.page.findFirst({
    where: { title: { equals: title } },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return serializePage(existing);

  const top = await prisma.page.aggregate({ _max: { order: true } });
  const created = await prisma.page.create({
    data: { title, order: (top._max.order ?? -1) + 1, parentPageId: parentPageId ?? null },
  });
  return serializePage(created);
}

/** Re-derives every outbound PageLink row for `pageId` from what its Cards' rich text
 *  actually contains right now, and reconciles the PageLink table to match — the
 *  secondary index Search/orphan-detection reads instead of re-parsing HTML on every
 *  query. Best-effort, same "runs at Save time, not every keystroke" convention as
 *  proximityService.reinforceContentLinks. */
export async function syncPageLinksForPage(pageId: string): Promise<void> {
  const pageCards = await prisma.pageCard.findMany({
    where: { pageId },
    include: { card: true },
  });

  const targetIds = new Set<string>();
  for (const pc of pageCards) {
    const content = pc.draftContent ?? pc.card.content;
    for (const id of findPageLinkIds(htmlToDoc(content))) {
      if (id !== pageId) targetIds.add(id);
    }
  }

  const existing = await prisma.pageLink.findMany({ where: { sourcePageId: pageId } });
  const existingIds = new Set(existing.map((l) => l.targetPageId));
  const toAdd = [...targetIds].filter((id) => !existingIds.has(id));
  const toRemove = existing.filter((l) => !targetIds.has(l.targetPageId));

  // Real target Pages only — a link inserted then had its target Page deleted out
  // from under it shouldn't create a dangling PageLink row.
  const validTargets = toAdd.length
    ? new Set((await prisma.page.findMany({ where: { id: { in: toAdd } }, select: { id: true } })).map((p) => p.id))
    : new Set<string>();

  await prisma.$transaction([
    ...toAdd
      .filter((id) => validTargets.has(id))
      .map((id) => prisma.pageLink.create({ data: { sourcePageId: pageId, targetPageId: id } })),
    ...toRemove.map((l) => prisma.pageLink.delete({ where: { id: l.id } })),
  ]);
}

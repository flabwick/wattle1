import type { Page, PageCardWithCard, PageSummary, PageWithCards } from "@wattle/shared";
import { prisma } from "../db.js";
import { serializeCard } from "./cardService.js";

export function serializePage(page: {
  id: string;
  title: string | null;
  order: number;
  siblingGroupId: string | null;
  orderInGroup: number | null;
  pinnedOrder: number | null;
  createdAt: Date;
  updatedAt: Date;
}): Page {
  return {
    id: page.id,
    title: page.title,
    order: page.order,
    siblingGroupId: page.siblingGroupId,
    orderInGroup: page.orderInGroup,
    pinnedOrder: page.pinnedOrder,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  };
}

function serializePageCard(pc: {
  id: string;
  pageId: string;
  cardId: string;
  order: number;
  draftTitle: string | null;
  draftContent: string | null;
  createdAt: Date;
  updatedAt: Date;
  card: {
    id: string;
    title: string;
    content: string;
    metadata: string;
    savedToVault: boolean;
    frozenAt: Date | null;
    forkedFromId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}): PageCardWithCard {
  return {
    id: pc.id,
    pageId: pc.pageId,
    cardId: pc.cardId,
    order: pc.order,
    draftTitle: pc.draftTitle,
    draftContent: pc.draftContent,
    createdAt: pc.createdAt.toISOString(),
    updatedAt: pc.updatedAt.toISOString(),
    card: serializeCard(pc.card),
  };
}

/** A single Page, with its Cards — the page-centric fetch every route now uses
 *  (Pages + Links + Search rebuild: a Page is loaded by its own id, not by walking a
 *  parent Tab's stack). Null if it doesn't exist, rather than throwing, so callers
 *  (e.g. "was my last-viewed Page deleted elsewhere?") can fall back gracefully. */
export async function getPage(id: string): Promise<PageWithCards | null> {
  const page = await prisma.page.findUnique({
    where: { id },
    include: { pageCards: { orderBy: { order: "asc" }, include: { card: true } } },
  });
  if (!page) return null;
  return { ...serializePage(page), pageCards: page.pageCards.map(serializePageCard) };
}

/** Every Page whose title matches `query` (a loose substring, same convention as
 *  cardService.listCards), or — with no query — every *claimed* Page (named, pinned,
 *  or linked from somewhere), most recently updated first: Search's default listing
 *  deliberately excludes anonymous untitled scratch Pages so they don't dominate a
 *  blank search (Phase 4's "Orphan explosion" risk called out in the rebuild plan). */
export async function searchPages(query?: string): Promise<PageSummary[]> {
  const pages = await prisma.page.findMany({
    where: query
      ? { title: { contains: query } }
      : {
          OR: [
            { title: { not: null } },
            { pinnedOrder: { not: null } },
            { linksIn: { some: {} } },
          ],
        },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { pageCards: { orderBy: { order: "asc" }, take: 1, include: { card: true } } },
  });
  return pages.map((p) => ({
    id: p.id,
    title: p.title,
    pinnedOrder: p.pinnedOrder,
    updatedAt: p.updatedAt.toISOString(),
    preview: p.pageCards[0]?.card.title || null,
  }));
}

/** The scarce pin rail (Phase 4) — every pinned Page, in ascending pin order. */
export async function listPinnedPages(): Promise<PageSummary[]> {
  const pages = await prisma.page.findMany({
    where: { pinnedOrder: { not: null } },
    orderBy: { pinnedOrder: "asc" },
    include: { pageCards: { orderBy: { order: "asc" }, take: 1, include: { card: true } } },
  });
  return pages.map((p) => ({
    id: p.id,
    title: p.title,
    pinnedOrder: p.pinnedOrder,
    updatedAt: p.updatedAt.toISOString(),
    preview: p.pageCards[0]?.card.title || null,
  }));
}

/** Every other Page sharing `pageId`'s `siblingGroupId` (a former Tab's stack, or an
 *  explicit next/prev trail) — Phase 3's "optional sibling next/prev polish", never
 *  primary navigation. Empty if the Page has no group. */
export async function listSiblingPages(pageId: string): Promise<PageSummary[]> {
  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { siblingGroupId: true } });
  if (!page?.siblingGroupId) return [];
  const siblings = await prisma.page.findMany({
    where: { siblingGroupId: page.siblingGroupId },
    orderBy: { orderInGroup: "asc" },
    include: { pageCards: { orderBy: { order: "asc" }, take: 1, include: { card: true } } },
  });
  return siblings.map((p) => ({
    id: p.id,
    title: p.title,
    pinnedOrder: p.pinnedOrder,
    updatedAt: p.updatedAt.toISOString(),
    preview: p.pageCards[0]?.card.title || null,
  }));
}

/** Creates a brand-new, loose Page — no Tab required (Phase 1 onward: a Page is a
 *  destination in its own right). Loose/unlinked Pages are a fine, permanent state,
 *  not a staging area that needs cleaning up later. */
export async function createPage(title?: string): Promise<Page> {
  const top = await prisma.page.aggregate({ _max: { order: true } });
  const page = await prisma.page.create({
    data: { order: (top._max.order ?? -1) + 1, title: title?.trim() || null },
  });
  return serializePage(page);
}

/** Renames a Page — blank clears back to untitled/loose rather than being rejected;
 *  an untitled Page is a valid, common state (see the schema's own doc comment), not
 *  an error condition. */
export async function renamePage(id: string, title: string): Promise<Page> {
  const page = await prisma.page.update({
    where: { id },
    data: { title: title.trim() || null },
  });
  return serializePage(page);
}

/** Pins (a non-null `pinnedOrder`) or unpins (`null`) a Page in the scarce pin rail —
 *  the caller (App.tsx) is responsible for choosing a sensible order value (e.g.
 *  appending at the end of the current pinned list). */
export async function setPinned(id: string, pinnedOrder: number | null): Promise<Page> {
  const page = await prisma.page.update({ where: { id }, data: { pinnedOrder } });
  return serializePage(page);
}

export async function deletePage(id: string): Promise<void> {
  await prisma.page.delete({ where: { id } });
}

/** Reorder Pages within a `siblingGroupId` (bottom-to-top, mirroring the pre-rebuild
 *  Tab-stack convention) — writes `orderInGroup`, not the legacy `order` column. */
export async function reorderSiblingPages(orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.page.update({ where: { id }, data: { orderInGroup: index } })),
  );
}

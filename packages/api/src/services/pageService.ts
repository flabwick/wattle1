import type { Page, PageCardWithCard, PageWithCards } from "@wattle/shared";
import { prisma } from "../db.js";
import { serializeCard } from "./cardService.js";

function serializePage(page: { id: string; order: number; createdAt: Date; updatedAt: Date }): Page {
  return {
    id: page.id,
    order: page.order,
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
    folderId: string | null;
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

/** List every Page within a Tab, with its Cards, ordered bottom (0) to top — the full
 *  visible stack for that Tab. Tabs don't share Pages (Step 6 spec §1.1), so every
 *  caller must say which one. */
export async function listPages(tabId: string): Promise<PageWithCards[]> {
  const pages = await prisma.page.findMany({
    where: { tabId },
    orderBy: { order: "asc" },
    include: { pageCards: { orderBy: { order: "asc" }, include: { card: true } } },
  });
  return pages.map((p) => ({
    ...serializePage(p),
    pageCards: p.pageCards.map(serializePageCard),
  }));
}

/** Create a new Page on top of the given Tab's stack (or at a given order if
 *  provided) — "top" is scoped to that Tab alone, since Page.order values aren't
 *  meaningful across different Tabs. */
export async function createPage(tabId: string, order?: number): Promise<Page> {
  const top = await prisma.page.aggregate({ where: { tabId }, _max: { order: true } });
  const nextOrder = order ?? (top._max.order ?? -1) + 1;
  const page = await prisma.page.create({ data: { order: nextOrder, tabId } });
  return serializePage(page);
}

export async function deletePage(id: string): Promise<void> {
  await prisma.page.delete({ where: { id } });
}

/** Reorder Pages in the stack. `orderedIds` is bottom-to-top. */
export async function reorderPages(orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.page.update({ where: { id }, data: { order: index } }),
    ),
  );
}

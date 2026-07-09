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
  card: { id: string; title: string; content: string; metadata: string; createdAt: Date; updatedAt: Date };
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

/** List every Page with its Cards, ordered bottom (0) to top — the full visible stack. */
export async function listPages(): Promise<PageWithCards[]> {
  const pages = await prisma.page.findMany({
    orderBy: { order: "asc" },
    include: { pageCards: { orderBy: { order: "asc" }, include: { card: true } } },
  });
  return pages.map((p) => ({
    ...serializePage(p),
    pageCards: p.pageCards.map(serializePageCard),
  }));
}

/** Create a new Page on top of the stack (or at a given order if provided). */
export async function createPage(order?: number): Promise<Page> {
  const top = await prisma.page.aggregate({ _max: { order: true } });
  const nextOrder = order ?? (top._max.order ?? -1) + 1;
  const page = await prisma.page.create({ data: { order: nextOrder } });
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

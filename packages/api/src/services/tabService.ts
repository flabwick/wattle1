import type { Tab } from "@wattle/shared";
import { prisma } from "../db.js";

function serialize(tab: { id: string; order: number; title: string; createdAt: Date; updatedAt: Date }): Tab {
  return {
    id: tab.id,
    order: tab.order,
    title: tab.title,
    createdAt: tab.createdAt.toISOString(),
    updatedAt: tab.updatedAt.toISOString(),
  };
}

/** List every Tab, left to right (ascending `order`) — Step 6 spec §1.1: a new
 *  top-level layer above Pages, each with its own independent Page stack. */
export async function listTabs(): Promise<Tab[]> {
  const tabs = await prisma.tab.findMany({ orderBy: { order: "asc" } });
  return tabs.map(serialize);
}

/** Create a new Tab at the right-hand end of the row. */
export async function createTab(title?: string): Promise<Tab> {
  const rightmost = await prisma.tab.aggregate({ _max: { order: true } });
  const nextOrder = (rightmost._max.order ?? -1) + 1;
  const tab = await prisma.tab.create({
    data: { order: nextOrder, title: title?.trim() || `Tab ${nextOrder + 1}` },
  });
  return serialize(tab);
}

/** Deletes a Tab and, via the schema's onDelete: Cascade, every Page (and PageCard)
 *  inside it. Deliberately no "keep at least one Tab" guard here — App.tsx's own
 *  bootstrap (mirroring its existing "keep currentPageId pointing at a real Page"
 *  convention) creates a fresh one the moment the list would otherwise go empty. */
export async function deleteTab(id: string): Promise<void> {
  await prisma.tab.delete({ where: { id } });
}

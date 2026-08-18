import type { DockCard, DockCardWithCard, PageCard } from "@wattle/shared";
import { defaultMetadata } from "@wattle/shared";
import { prisma } from "../db.js";
import type { UploadedFile } from "../uploads.js";
import { buildFileCardCreateData, forkCard, serializeCard } from "./cardService.js";
import * as proximityService from "./proximityService.js";

/** Exported so generationService.ts's own persistGeneratedToDockCard can reuse this
 *  shape rather than duplicating it. */
export function serializeDockCard(dc: {
  id: string;
  cardId: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}): DockCard {
  return {
    id: dc.id,
    cardId: dc.cardId,
    order: dc.order,
    createdAt: dc.createdAt.toISOString(),
    updatedAt: dc.updatedAt.toISOString(),
  };
}

/** List every Dock Card, ordered for the Dock's own scrollable list — a persistent
 *  scratchpad layer that sits outside every Page/Tab and is never part of
 *  generation context. Holds as many Cards as the user adds, browsed by scrolling
 *  (Dock.tsx renders one DockCardView per row, stacked); `order` is append order,
 *  same convention as PageCard's own. */
export async function listDockCards(): Promise<DockCardWithCard[]> {
  const dockCards = await prisma.dockCard.findMany({
    orderBy: { order: "asc" },
    include: { card: true },
  });
  return dockCards.map((dc) => ({ ...serializeDockCard(dc), card: serializeCard(dc.card) }));
}

/** The next append position for a new DockCard row — same "max existing order + 1"
 *  convention pageCardService uses for a Page's own bottom-of-feed append. */
async function nextOrder(tx: Pick<typeof prisma, "dockCard"> = prisma): Promise<number> {
  const max = await tx.dockCard.aggregate({ _max: { order: true } });
  return (max._max.order ?? -1) + 1;
}

/** Bring an existing (typically vault) Card into the Dock — the Vault panel's "Add to
 *  Dock" action. */
export async function addExistingCardToDock(cardId: string): Promise<DockCardWithCard> {
  const dockCard = await prisma.dockCard.create({
    data: { cardId, order: await nextOrder() },
    include: { card: true },
  });
  return { ...serializeDockCard(dockCard), card: serializeCard(dockCard.card) };
}

/** Create a brand-new blank (or pre-filled) Card directly in the Dock — the Dock's
 *  own inline "add" affordance, always available alongside however many Cards are
 *  already there, page-local-scratch style (savedToVault: false) same as
 *  addNewCardToPage, until it's independently saved to the vault. */
export async function createCardInDock(title: string, content: string): Promise<DockCardWithCard> {
  const dockCard = await prisma.dockCard.create({
    data: {
      order: await nextOrder(),
      card: {
        create: {
          title,
          content,
          metadata: JSON.stringify(defaultMetadata()),
          savedToVault: false,
        },
      },
    },
    include: { card: true },
  });
  return { ...serializeDockCard(dockCard), card: serializeCard(dockCard.card) };
}

/** Attach an uploaded file to the Dock as a new "file"-typed Card — the Dock's own
 *  inline "upload" affordance, mirrors pageCardService.addFileCardToPage. */
export async function addFileCardToDock(file: UploadedFile): Promise<DockCardWithCard> {
  const dockCard = await prisma.dockCard.create({
    data: {
      order: await nextOrder(),
      card: {
        create: buildFileCardCreateData(file, { savedToVault: false }),
      },
    },
    include: { card: true },
  });
  return { ...serializeDockCard(dockCard), card: serializeCard(dockCard.card) };
}

/** Converts an existing Dock Card's own Card into a Stack in place, with that Card
 *  as the Stack's first (and initially only) member — the Dock's own counterpart to
 *  stackService.convertCardToStack (PageCard version). Reuses the DockCard row
 *  itself (same id, same order) rather than deleting and recreating it: just
 *  repoints its cardId at a freshly created Stack container. A DockCard has no
 *  draft concept of its own (writes straight through), so unlike the PageCard
 *  version there's no pending draft to move onto the new StackMember row. */
export async function convertDockCardToStack(dockCardId: string): Promise<DockCardWithCard> {
  const dockCard = await prisma.dockCard.findUniqueOrThrow({ where: { id: dockCardId } });
  const stackCard = await prisma.card.create({
    data: {
      title: "",
      content: "",
      metadata: JSON.stringify({ ...defaultMetadata(), typeId: "stack", stack: { activeIndex: 0 } }),
      savedToVault: false,
    },
  });
  await prisma.stackMember.create({
    data: {
      stackCard: { connect: { id: stackCard.id } },
      order: 0,
      card: { connect: { id: dockCard.cardId } },
    },
  });
  const updated = await prisma.dockCard.update({
    where: { id: dockCardId },
    data: { cardId: stackCard.id },
    include: { card: true },
  });
  return { ...serializeDockCard(updated), card: serializeCard(updated.card) };
}

/** Forks the Frozen Card this DockCard points at and repoints it at the new fork —
 *  the Dock's own counterpart to pageCardService.forkOccurrence above, same reasoning. */
export async function forkOccurrence(dockCardId: string): Promise<DockCardWithCard> {
  const dockCard = await prisma.dockCard.findUniqueOrThrow({ where: { id: dockCardId } });
  const fork = await forkCard(dockCard.cardId);
  const updated = await prisma.dockCard.update({
    where: { id: dockCardId },
    data: { cardId: fork.id },
    include: { card: true },
  });
  return { ...serializeDockCard(updated), card: serializeCard(updated.card) };
}

/** The Dock Card panel's "Close" action — a Card saved to the vault just gets unpinned
 *  (its DockCard row deleted, the vault Card itself untouched), but one that was only
 *  ever a Dock scratch Card has nowhere else to live: closing it deletes the Card
 *  outright, cascading away its DockCard row with it (schema.prisma's onDelete:
 *  Cascade on DockCard.card). */
export async function removeDockCard(id: string): Promise<void> {
  const dockCard = await prisma.dockCard.findUniqueOrThrow({
    where: { id },
    include: { card: true },
  });
  if (dockCard.card.savedToVault) {
    await prisma.dockCard.delete({ where: { id } });
  } else {
    await prisma.card.delete({ where: { id: dockCard.cardId } });
  }
}

/** Move a Card from a Page onto the Dock (the Dock's "Move to Dock" action on a
 *  selected Card — Step 6 spec §4.2) — the reverse of moveDockCardToPage below. Any
 *  pending draft is flushed into the Card first, since a DockCard has no draft
 *  concept of its own; unlike removeFromPage this doesn't force savedToVault, since
 *  the new DockCard row is itself a real, persistent home for the Card. */
export async function movePageCardToDock(pageCardId: string): Promise<DockCardWithCard> {
  return prisma.$transaction(async (tx) => {
    const pageCard = await tx.pageCard.findUniqueOrThrow({
      where: { id: pageCardId },
      include: { card: true },
    });
    if (pageCard.draftTitle !== null || pageCard.draftContent !== null) {
      await tx.card.update({
        where: { id: pageCard.cardId },
        data: {
          title: pageCard.draftTitle ?? pageCard.card.title,
          content: pageCard.draftContent ?? pageCard.card.content,
        },
      });
    }
    await tx.pageCard.delete({ where: { id: pageCardId } });
    const dockCard = await tx.dockCard.create({
      data: { cardId: pageCard.cardId, order: await nextOrder(tx) },
      include: { card: true },
    });
    return { ...serializeDockCard(dockCard), card: serializeCard(dockCard.card) };
  });
}

/** Move a Card from the Dock onto a Page, at a specific position (Move Mode's own
 *  drop zones, same as pageCardService.movePageCard) — the reverse of
 *  movePageCardToDock above. `destIndex` is top-to-bottom as displayed, same
 *  convention as movePageCard/reorderPageCards; any Page id is accepted regardless
 *  of which Tab it belongs to. */
export async function moveDockCardToPage(
  dockCardId: string,
  destPageId: string,
  destIndex: number,
): Promise<PageCard> {
  const result = await prisma.$transaction(async (tx) => {
    const dockCard = await tx.dockCard.findUniqueOrThrow({ where: { id: dockCardId } });
    await tx.dockCard.delete({ where: { id: dockCardId } });

    const destSiblings = await tx.pageCard.findMany({
      where: { pageId: destPageId },
      orderBy: { order: "asc" },
    });
    const clampedIndex = Math.max(0, Math.min(destIndex, destSiblings.length));
    const pageCard = await tx.pageCard.create({
      data: { pageId: destPageId, cardId: dockCard.cardId, order: clampedIndex },
    });
    const destOrder = [
      ...destSiblings.slice(0, clampedIndex).map((pc) => pc.id),
      pageCard.id,
      ...destSiblings.slice(clampedIndex).map((pc) => pc.id),
    ];
    await Promise.all(
      destOrder.map((id, index) => tx.pageCard.update({ where: { id }, data: { order: index } })),
    );

    return {
      id: pageCard.id,
      pageId: pageCard.pageId,
      cardId: pageCard.cardId,
      order: clampedIndex,
      draftTitle: pageCard.draftTitle,
      draftContent: pageCard.draftContent,
      createdAt: pageCard.createdAt.toISOString(),
      updatedAt: pageCard.updatedAt.toISOString(),
    };
  });
  await proximityService.reinforcePageCoPresence(destPageId);
  return result;
}

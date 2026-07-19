import type { DockCard, DockCardWithCard, PageCard } from "@wattle/shared";
import { defaultMetadata } from "@wattle/shared";
import { prisma } from "../db.js";
import { serializeCard } from "./cardService.js";
import type { UploadedFile } from "./pageCardService.js";

function serialize(dc: {
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

/** List every Dock Card, ordered for the Dock's horizontal scroll row (Step 6 spec
 *  §1.2) — a persistent scratchpad layer that sits outside every Page/Tab and is
 *  never part of generation context. */
export async function listDockCards(): Promise<DockCardWithCard[]> {
  const dockCards = await prisma.dockCard.findMany({
    orderBy: { order: "asc" },
    include: { card: true },
  });
  return dockCards.map((dc) => ({ ...serialize(dc), card: serializeCard(dc.card) }));
}

/** Bring an existing (typically vault) Card into the Dock, appended at the end of the
 *  scroll row — the Dock Card panel's "Open" action. */
export async function addExistingCardToDock(cardId: string): Promise<DockCardWithCard> {
  const bottom = await prisma.dockCard.aggregate({ _max: { order: true } });
  const dockCard = await prisma.dockCard.create({
    data: { cardId, order: (bottom._max.order ?? -1) + 1 },
    include: { card: true },
  });
  return { ...serialize(dockCard), card: serializeCard(dockCard.card) };
}

/** Create a brand-new blank (or pre-filled) Card directly in the Dock — the Dock Card
 *  panel's "Add" action, page-local-scratch style (savedToVault: false) same as
 *  addNewCardToPage, until it's independently saved to the vault. */
export async function createCardInDock(title: string, content: string): Promise<DockCardWithCard> {
  const bottom = await prisma.dockCard.aggregate({ _max: { order: true } });
  const dockCard = await prisma.dockCard.create({
    data: {
      order: (bottom._max.order ?? -1) + 1,
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
  return { ...serialize(dockCard), card: serializeCard(dockCard.card) };
}

/** Attach an uploaded file to the Dock as a new "file"-typed Card — the Dock Card
 *  panel's "Upload" action, mirrors pageCardService.addFileCardToPage. */
export async function addFileCardToDock(file: UploadedFile): Promise<DockCardWithCard> {
  const bottom = await prisma.dockCard.aggregate({ _max: { order: true } });
  const dockCard = await prisma.dockCard.create({
    data: {
      order: (bottom._max.order ?? -1) + 1,
      card: {
        create: {
          title: file.originalName,
          content: "",
          metadata: JSON.stringify({
            ...defaultMetadata(),
            typeId: "file",
            file: {
              storedName: file.storedName,
              originalName: file.originalName,
              mimeType: file.mimeType,
              size: file.size,
            },
          }),
          savedToVault: false,
        },
      },
    },
    include: { card: true },
  });
  return { ...serialize(dockCard), card: serializeCard(dockCard.card) };
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
    const bottom = await tx.dockCard.aggregate({ _max: { order: true } });
    const dockCard = await tx.dockCard.create({
      data: { cardId: pageCard.cardId, order: (bottom._max.order ?? -1) + 1 },
      include: { card: true },
    });
    return { ...serialize(dockCard), card: serializeCard(dockCard.card) };
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
  return prisma.$transaction(async (tx) => {
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
}

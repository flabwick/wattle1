import type { PageCard, PageCardWithCard } from "@wattle/shared";
import { prisma } from "../db.js";

function serialize(pc: {
  id: string;
  pageId: string;
  cardId: string;
  order: number;
  draftTitle: string | null;
  draftContent: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PageCard {
  return {
    id: pc.id,
    pageId: pc.pageId,
    cardId: pc.cardId,
    order: pc.order,
    draftTitle: pc.draftTitle,
    draftContent: pc.draftContent,
    createdAt: pc.createdAt.toISOString(),
    updatedAt: pc.updatedAt.toISOString(),
  };
}

/** Open an existing vault Card into a Page, appended at the bottom of that Page. */
export async function addExistingCardToPage(
  pageId: string,
  cardId: string,
): Promise<PageCard> {
  const bottom = await prisma.pageCard.aggregate({
    where: { pageId },
    _max: { order: true },
  });
  const pageCard = await prisma.pageCard.create({
    data: { pageId, cardId, order: (bottom._max.order ?? -1) + 1 },
  });
  return serialize(pageCard);
}

/** Create a brand-new blank Card directly in a Page's slot (spec1.md Part 3 "Pages"). */
export async function addNewCardToPage(
  pageId: string,
  title: string,
  content: string,
): Promise<PageCardWithCard> {
  const bottom = await prisma.pageCard.aggregate({
    where: { pageId },
    _max: { order: true },
  });
  const pageCard = await prisma.pageCard.create({
    data: {
      pageId,
      order: (bottom._max.order ?? -1) + 1,
      card: { create: { title, content } },
    },
    include: { card: true },
  });
  return {
    ...serialize(pageCard),
    card: {
      id: pageCard.card.id,
      title: pageCard.card.title,
      content: pageCard.card.content,
      createdAt: pageCard.card.createdAt.toISOString(),
      updatedAt: pageCard.card.updatedAt.toISOString(),
    },
  };
}

/** Inline-edit a Card's text within a Page without touching the vault copy yet. */
export async function updateDraft(
  pageCardId: string,
  draft: { title?: string; content?: string },
): Promise<PageCard> {
  const pageCard = await prisma.pageCard.update({
    where: { id: pageCardId },
    data: { draftTitle: draft.title, draftContent: draft.content },
  });
  return serialize(pageCard);
}

/** Persist a PageCard's draft edits back to its vault Card, then clear the draft. */
export async function saveToVault(pageCardId: string): Promise<PageCard> {
  const pageCard = await prisma.pageCard.findUniqueOrThrow({
    where: { id: pageCardId },
    include: { card: true },
  });

  await prisma.card.update({
    where: { id: pageCard.cardId },
    data: {
      title: pageCard.draftTitle ?? pageCard.card.title,
      content: pageCard.draftContent ?? pageCard.card.content,
    },
  });

  const cleared = await prisma.pageCard.update({
    where: { id: pageCardId },
    data: { draftTitle: null, draftContent: null },
  });
  return serialize(cleared);
}

/** Remove a Card from a Page only — the vault Card itself is untouched. */
export async function removeFromPage(pageCardId: string): Promise<void> {
  await prisma.pageCard.delete({ where: { id: pageCardId } });
}

/** Remove a Card from the Page and delete it from the vault entirely. */
export async function deleteEntirely(pageCardId: string): Promise<void> {
  const pageCard = await prisma.pageCard.findUniqueOrThrow({
    where: { id: pageCardId },
  });
  await prisma.card.delete({ where: { id: pageCard.cardId } });
}

/** Reorder Cards within a single Page. `orderedIds` is top-to-bottom as displayed. */
export async function reorderPageCards(
  pageId: string,
  orderedIds: string[],
): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.pageCard.updateMany({
        where: { id, pageId },
        data: { order: index },
      }),
    ),
  );
}

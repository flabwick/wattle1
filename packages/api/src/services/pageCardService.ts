import type { PageCard, PageCardWithCard } from "@wattle/shared";
import { defaultMetadata } from "@wattle/shared";
import { prisma } from "../db.js";
import { serializeCard } from "./cardService.js";

export interface UploadedFile {
  storedName: string;
  originalName: string;
  mimeType: string;
  size: number;
}

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

/** Create a brand-new blank Card directly in a Page's slot (spec1.md Part 3 "Pages").
 *  Page-local scratch content, not yet a Vault entry — see schema.prisma's
 *  Card.savedToVault doc comment. */
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
      page: { connect: { id: pageId } },
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
  return {
    ...serialize(pageCard),
    card: serializeCard(pageCard.card),
  };
}

/** Attach an uploaded file to a Page as a new "file"-typed Card (see the Dock's upload
 *  action) — page-local scratch content, same as addNewCardToPage, until Saved. */
export async function addFileCardToPage(
  pageId: string,
  file: UploadedFile,
): Promise<PageCardWithCard> {
  const bottom = await prisma.pageCard.aggregate({
    where: { pageId },
    _max: { order: true },
  });
  const pageCard = await prisma.pageCard.create({
    data: {
      page: { connect: { id: pageId } },
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
  return {
    ...serialize(pageCard),
    card: serializeCard(pageCard.card),
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

/** Persist a PageCard's draft edits back to its vault Card, then clear the draft.
 *  Also the one place a Card ever flips from page-local to a real, independently
 *  accessible Vault entry (savedToVault: true) — see schema.prisma's doc comment. */
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
      savedToVault: true,
    },
  });

  const cleared = await prisma.pageCard.update({
    where: { id: pageCardId },
    data: { draftTitle: null, draftContent: null },
  });
  return serialize(cleared);
}

/** Remove a Card from a Page only — never the vault Card itself. "Remove" is meant to
 *  be the safe, low-friction action (the Dock's separate, explicitly destructive
 *  "Delete" action — see deleteEntirely below — is the only way to actually remove a
 *  Card from the vault): a Card that was still page-local scratch content
 *  (savedToVault: false) gets auto-promoted to the vault first, carrying over
 *  whatever draft it had, so removing it from a Page can never silently destroy
 *  unsaved work. */
export async function removeFromPage(pageCardId: string): Promise<void> {
  const pageCard = await prisma.pageCard.findUniqueOrThrow({
    where: { id: pageCardId },
    include: { card: true },
  });
  if (!pageCard.card.savedToVault) {
    await prisma.card.update({
      where: { id: pageCard.cardId },
      data: {
        title: pageCard.draftTitle ?? pageCard.card.title,
        content: pageCard.draftContent ?? pageCard.card.content,
        savedToVault: true,
      },
    });
  }
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

import type { PageCard, PageCardWithCard } from "@wattle/shared";
import { cardMetadataV1Schema, defaultMetadata } from "@wattle/shared";
import { prisma } from "../db.js";
import type { UploadedFile } from "../uploads.js";
import { buildFileCardCreateData, forkCard, serializeCard } from "./cardService.js";
import * as proximityService from "./proximityService.js";
import * as summaryService from "./summaryService.js";
import { syncPageLinksForPage } from "./pageLinkService.js";

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
  await proximityService.reinforcePageCoPresence(pageId);
  return serialize(pageCard);
}

/** Create a brand-new blank Card directly in a Page's slot (spec1.md Part 3 "Pages").
 *  Page-local scratch content, not yet a Vault entry — see schema.prisma's
 *  Card.savedToVault doc comment. `metadata`, if given, replaces the plain "note"
 *  default entirely (e.g. the Feed Input Button's "Action" type-picker option sets
 *  `typeId: "action"` plus its own default button config) — validated the same way
 *  cardService.createCard validates a caller-supplied metadata. */
export async function addNewCardToPage(
  pageId: string,
  title: string,
  content: string,
  metadata?: unknown,
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
          metadata: JSON.stringify(metadata === undefined ? defaultMetadata() : cardMetadataV1Schema.parse(metadata)),
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
        create: buildFileCardCreateData(file, { savedToVault: false }),
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
 *  accessible Vault entry (savedToVault: true) — see schema.prisma's doc comment. No
 *  title is required, on this path or any other — a Card can have no title by
 *  default (see cardService.createCard's own doc comment). */
export async function saveToVault(pageCardId: string): Promise<PageCard> {
  const pageCard = await prisma.pageCard.findUniqueOrThrow({
    where: { id: pageCardId },
    include: { card: true },
  });
  const title = pageCard.draftTitle ?? pageCard.card.title;

  const saved = await prisma.card.update({
    where: { id: pageCard.cardId },
    data: {
      title,
      content: pageCard.draftContent ?? pageCard.card.content,
      savedToVault: true,
    },
  });

  const cleared = await prisma.pageCard.update({
    where: { id: pageCardId },
    data: { draftTitle: null, draftContent: null },
  });
  // The moment this Card's content becomes canonical — reinforce its co-presence with
  // whatever else is already saved on this Page, plus any embeds/links it already
  // carries, and kick off its first summary immediately (a Save is a discrete event,
  // not a keystroke stream, so no debounce needed here unlike cardService.updateCard).
  await proximityService.reinforcePageCoPresence(pageCard.pageId);
  await proximityService.reinforceContentLinks(serializeCard(saved));
  await syncPageLinksForPage(pageCard.pageId);
  await summaryService.refreshSummary(saved.id);
  return serialize(cleared);
}

/** Forks the Frozen Card this one PageCard occurrence points at (cardService.ts's
 *  forkCard) and repoints just this occurrence's `cardId` at the new fork — the
 *  Wattle vault plan's "editing a Frozen Card always forks": only the occurrence
 *  being edited switches to the fork, any other open instance of the same Frozen
 *  original elsewhere is untouched. */
export async function forkOccurrence(pageCardId: string): Promise<PageCard> {
  const pageCard = await prisma.pageCard.findUniqueOrThrow({ where: { id: pageCardId } });
  const fork = await forkCard(pageCard.cardId);
  const updated = await prisma.pageCard.update({
    where: { id: pageCardId },
    data: { cardId: fork.id },
  });
  return serialize(updated);
}

/** Remove a Card from a Page only — never the vault Card itself. "Remove" is meant to
 *  be the safe, low-friction action (the Dock's separate, explicitly destructive
 *  "Delete" action — see deleteEntirely below — is the only way to actually remove a
 *  Card from the vault): a Card that was still page-local scratch content
 *  (savedToVault: false) gets auto-promoted to the vault first, carrying over
 *  whatever draft it had, so removing it from a Page can never silently destroy
 *  unsaved work. Deliberately does not enforce saveToVault's title requirement — an
 *  untitled Card promoted this way just becomes an untitled vault Card, rather than
 *  risking losing it entirely over a missing title during a safety-net promotion the
 *  user didn't explicitly ask for. */
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
  // Reordering changes stack-order distance, which co-presence weight depends on.
  await proximityService.reinforcePageCoPresence(pageId);
}

/** Move a PageCard to a specific position, either within its own Page or onto a
 *  different one, in a single atomic step (Move Mode — the Dock's Move action).
 *  Unlike removeFromPage, the PageCard is never orphaned mid-operation (it's always
 *  attached to exactly one Page, both before and after), so there's no
 *  savedToVault-promotion concern here the way there is for a permanent removal.
 *  `destIndex` is top-to-bottom as displayed, same convention as reorderPageCards. */
export async function movePageCard(
  pageCardId: string,
  destPageId: string,
  destIndex: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const pageCard = await tx.pageCard.findUniqueOrThrow({ where: { id: pageCardId } });
    const sourcePageId = pageCard.pageId;

    if (sourcePageId !== destPageId) {
      const sourceSiblings = await tx.pageCard.findMany({
        where: { pageId: sourcePageId, id: { not: pageCardId } },
        orderBy: { order: "asc" },
      });
      await Promise.all(
        sourceSiblings.map((pc, index) =>
          tx.pageCard.update({ where: { id: pc.id }, data: { order: index } }),
        ),
      );
    }

    const destSiblings = await tx.pageCard.findMany({
      where: { pageId: destPageId, id: { not: pageCardId } },
      orderBy: { order: "asc" },
    });
    const clampedIndex = Math.max(0, Math.min(destIndex, destSiblings.length));
    const destOrder = [
      ...destSiblings.slice(0, clampedIndex).map((pc) => pc.id),
      pageCardId,
      ...destSiblings.slice(clampedIndex).map((pc) => pc.id),
    ];
    await Promise.all(
      destOrder.map((id, index) =>
        tx.pageCard.update({
          where: { id },
          data: id === pageCardId ? { pageId: destPageId, order: index } : { order: index },
        }),
      ),
    );
  });
  await proximityService.reinforcePageCoPresence(destPageId);
}

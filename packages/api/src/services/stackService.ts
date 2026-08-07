import type { PageCardWithCard, StackData, StackMember, StackMemberWithCard } from "@wattle/shared";
import { cardMetadataV1Schema, defaultMetadata, migrateMetadata } from "@wattle/shared";
import { prisma } from "../db.js";
import { serializeCard } from "./cardService.js";

export function serializeMember(sm: {
  id: string;
  stackCardId: string;
  cardId: string;
  order: number;
  draftTitle: string | null;
  draftContent: string | null;
  createdAt: Date;
  updatedAt: Date;
}): StackMember {
  return {
    id: sm.id,
    stackCardId: sm.stackCardId,
    cardId: sm.cardId,
    order: sm.order,
    draftTitle: sm.draftTitle,
    draftContent: sm.draftContent,
    createdAt: sm.createdAt.toISOString(),
    updatedAt: sm.updatedAt.toISOString(),
  };
}

async function readActiveIndex(stackCardId: string): Promise<number> {
  const stackCard = await prisma.card.findUniqueOrThrow({ where: { id: stackCardId } });
  const meta = migrateMetadata(JSON.parse(stackCard.metadata));
  return meta.stack?.activeIndex ?? 0;
}

/** Clamps and persists `metadata.stack.activeIndex` against however many members the
 *  Stack actually has right now — the one place that ever writes this field, so every
 *  caller (setActiveIndex, addMember, removeMember) routes through it rather than
 *  risking an index that outlives the member it pointed to. */
async function writeActiveIndex(stackCardId: string, index: number, memberCount: number): Promise<number> {
  const clamped = Math.max(0, Math.min(index, Math.max(memberCount - 1, 0)));
  const stackCard = await prisma.card.findUniqueOrThrow({ where: { id: stackCardId } });
  const meta = migrateMetadata(JSON.parse(stackCard.metadata));
  meta.stack = { activeIndex: clamped };
  await prisma.card.update({
    where: { id: stackCardId },
    data: { metadata: JSON.stringify(cardMetadataV1Schema.parse(meta)) },
  });
  return clamped;
}

/** Every alternate belonging to a Stack, top-to-bottom in the rail's own order. */
export async function listMembers(stackCardId: string): Promise<StackMemberWithCard[]> {
  const members = await prisma.stackMember.findMany({
    where: { stackCardId },
    orderBy: { order: "asc" },
    include: { card: true },
  });
  return members.map((m) => ({ ...serializeMember(m), card: serializeCard(m.card) }));
}

/** The Stack's full state (GET /api/stacks/:stackCardId) — CardStackRail's real data
 *  source, replacing the T0 prototype's MOCK_MEMBERS. */
export async function getStackData(stackCardId: string): Promise<StackData> {
  const members = await listMembers(stackCardId);
  const rawIndex = await readActiveIndex(stackCardId);
  const activeIndex = Math.max(0, Math.min(rawIndex, Math.max(members.length - 1, 0)));
  return { activeIndex, members };
}

/** Creates a new Stack Card at the bottom of a Page, with exactly one blank member to
 *  start — both the container and its first member are page-local scratch content
 *  (savedToVault: false), same as any other freshly created Card. The container's own
 *  title/content stay permanently empty; it never carries text of its own (see
 *  stackCardType.ts) and — deliberately — never becomes savedToVault, so it can never
 *  appear in the Vault's listing (cardService.listCards' `savedToVault: true` filter)
 *  even by accident. */
export async function createStackInPage(pageId: string): Promise<PageCardWithCard> {
  const bottom = await prisma.pageCard.aggregate({ where: { pageId }, _max: { order: true } });
  const pageCard = await prisma.pageCard.create({
    data: {
      page: { connect: { id: pageId } },
      order: (bottom._max.order ?? -1) + 1,
      card: {
        create: {
          title: "",
          content: "",
          metadata: JSON.stringify({ ...defaultMetadata(), typeId: "stack", stack: { activeIndex: 0 } }),
          savedToVault: false,
        },
      },
    },
    include: { card: true },
  });
  await addMember(pageCard.cardId);
  return {
    id: pageCard.id,
    pageId: pageCard.pageId,
    cardId: pageCard.cardId,
    order: pageCard.order,
    draftTitle: pageCard.draftTitle,
    draftContent: pageCard.draftContent,
    createdAt: pageCard.createdAt.toISOString(),
    updatedAt: pageCard.updatedAt.toISOString(),
    card: serializeCard(pageCard.card),
  };
}

/** Converts an existing top-level Card into a Stack in place, with that Card as the
 *  Stack's first (and initially only) member — the Dock's "Make a Stack" action on
 *  any single non-Stack selection. Reuses the PageCard row itself (same id, same
 *  order — its position in the Page never moves) rather than deleting and
 *  recreating it: just repoints its cardId at a freshly created Stack container, and
 *  moves whatever draft the PageCard was carrying onto a new StackMember row that
 *  wraps the original Card, unchanged. */
export async function convertCardToStack(pageCardId: string): Promise<PageCardWithCard> {
  const pageCard = await prisma.pageCard.findUniqueOrThrow({ where: { id: pageCardId } });
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
      card: { connect: { id: pageCard.cardId } },
      draftTitle: pageCard.draftTitle,
      draftContent: pageCard.draftContent,
    },
  });
  const updated = await prisma.pageCard.update({
    where: { id: pageCardId },
    data: { cardId: stackCard.id, draftTitle: null, draftContent: null },
    include: { card: true },
  });
  return {
    id: updated.id,
    pageId: updated.pageId,
    cardId: updated.cardId,
    order: updated.order,
    draftTitle: updated.draftTitle,
    draftContent: updated.draftContent,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    card: serializeCard(updated.card),
  };
}

/** Appends a new blank member (always a plain "note" — see cardService's default
 *  metadata, which sets no typeId — a Stack can never contain another Stack; there is
 *  deliberately no code path that lets a member's typeId be set to "stack") and makes
 *  it the active one — the rail's own "+" (CardStackRail.tsx's addAlternate), and also
 *  what happens when the forward arrow turns into an add affordance at the last
 *  member. */
export async function addMember(stackCardId: string): Promise<StackMemberWithCard> {
  const bottom = await prisma.stackMember.aggregate({ where: { stackCardId }, _max: { order: true } });
  const nextOrder = (bottom._max.order ?? -1) + 1;
  const member = await prisma.stackMember.create({
    data: {
      stackCard: { connect: { id: stackCardId } },
      order: nextOrder,
      card: {
        create: {
          title: "",
          content: "",
          metadata: JSON.stringify(defaultMetadata()),
          savedToVault: false,
        },
      },
    },
    include: { card: true },
  });
  const count = await prisma.stackMember.count({ where: { stackCardId } });
  await writeActiveIndex(stackCardId, nextOrder, count);
  return { ...serializeMember(member), card: serializeCard(member.card) };
}

/** Inline-edit a member's draft, same staging convention as pageCardService.updateDraft
 *  (POST .../save below is what actually commits it to the vault Card). */
export async function updateMemberDraft(
  memberId: string,
  draft: { title?: string; content?: string },
): Promise<StackMember> {
  const member = await prisma.stackMember.update({
    where: { id: memberId },
    data: { draftTitle: draft.title, draftContent: draft.content },
  });
  return serializeMember(member);
}

/** Persists a member's draft edits back to its own vault Card — the "children can be
 *  saved individually" half of the Stack concept. Mirrors pageCardService.saveToVault
 *  exactly, just scoped to a StackMember row instead of a PageCard one — no title
 *  required, same as that path (see cardService.createCard's own doc comment). */
export async function saveMemberToVault(memberId: string): Promise<StackMember> {
  const member = await prisma.stackMember.findUniqueOrThrow({
    where: { id: memberId },
    include: { card: true },
  });
  const title = member.draftTitle ?? member.card.title;
  await prisma.card.update({
    where: { id: member.cardId },
    data: {
      title,
      content: member.draftContent ?? member.card.content,
      savedToVault: true,
    },
  });
  const cleared = await prisma.stackMember.update({
    where: { id: memberId },
    data: { draftTitle: null, draftContent: null },
  });
  return serializeMember(cleared);
}

/** Removes one member from its Stack. A member still page-local scratch content
 *  (never saved) is promoted to the vault first, same safety rule as
 *  pageCardService.removeFromPage — removing it from the Stack can never silently
 *  destroy unsaved work. If that was the last member, the whole (now-empty) Stack is
 *  deleted too (the simpler of the two options the spec allowed for, rather than
 *  leaving an empty shell with nothing but an add affordance) — the container's own
 *  PageCard row cascades away with it. */
export async function removeMember(memberId: string): Promise<{ stackDeleted: boolean }> {
  const member = await prisma.stackMember.findUniqueOrThrow({
    where: { id: memberId },
    include: { card: true },
  });
  if (!member.card.savedToVault) {
    await prisma.card.update({
      where: { id: member.cardId },
      data: {
        title: member.draftTitle ?? member.card.title,
        content: member.draftContent ?? member.card.content,
        savedToVault: true,
      },
    });
  }
  const { stackCardId } = member;
  await prisma.stackMember.delete({ where: { id: memberId } });

  const remaining = await prisma.stackMember.count({ where: { stackCardId } });
  if (remaining === 0) {
    await prisma.card.delete({ where: { id: stackCardId } });
    return { stackDeleted: true };
  }
  const currentIndex = await readActiveIndex(stackCardId);
  await writeActiveIndex(stackCardId, currentIndex, remaining);
  return { stackDeleted: false };
}

/** The rail's ← / → — clamped against however many members exist right now, same as
 *  every other write to this field (writeActiveIndex above). */
export async function setActiveIndex(stackCardId: string, index: number): Promise<number> {
  const count = await prisma.stackMember.count({ where: { stackCardId } });
  return writeActiveIndex(stackCardId, index, count);
}

/** "Close Stack" (Dock action on a selected Stack Card) — removes the whole Stack
 *  from the Page as a unit, but safely: same "never silently destroy unsaved work"
 *  rule pageCardService.removeFromPage and removeMember above both use, applied to
 *  every member at once, rather than deleteStack below's deliberately destructive
 *  sweep. Deleting just the container Card cascades away its own PageCard row and
 *  every StackMember row (schema.prisma's `onDelete: Cascade` on both of
 *  StackMember's relations) — member Cards themselves are untouched, left as
 *  ordinary vault Cards no longer on any Page, exactly like removeFromPage leaves a
 *  plain Card. */
export async function closeStack(stackCardId: string): Promise<void> {
  const members = await prisma.stackMember.findMany({ where: { stackCardId }, include: { card: true } });
  for (const member of members) {
    if (!member.card.savedToVault) {
      await prisma.card.update({
        where: { id: member.cardId },
        data: {
          title: member.draftTitle ?? member.card.title,
          content: member.draftContent ?? member.card.content,
          savedToVault: true,
        },
      });
    }
  }
  await prisma.card.delete({ where: { id: stackCardId } });
}

/** "Delete Stack" (Dock action on a selected Stack Card) — removes the whole Stack and
 *  every member's own vault Card, not just the container, per spec: an explicit,
 *  fully destructive action (same convention as the Vault panel's own Delete, as
 *  opposed to a page's non-destructive Remove) rather than the individual-member
 *  auto-promote-then-detach removeMember above does. */
export async function deleteStack(stackCardId: string): Promise<void> {
  const members = await prisma.stackMember.findMany({ where: { stackCardId } });
  for (const member of members) {
    await prisma.card.delete({ where: { id: member.cardId } });
  }
  await prisma.card.delete({ where: { id: stackCardId } });
}

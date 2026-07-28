import type { Card, CreateCardInput, UpdateCardInput } from "@wattle/shared";
import { cardMetadataV1Schema, defaultMetadata, migrateMetadata } from "@wattle/shared";
import { prisma } from "../db.js";

/** Card.metadata is stored as a JSON string (see schema.prisma); parse defensively. */
function parseMetadataColumn(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Shared by every place that turns a Card row (or a Prisma-nested `card`) into a Card. */
export function serializeCard(card: {
  id: string;
  title: string;
  content: string;
  metadata: string;
  savedToVault: boolean;
  folderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Card {
  return {
    id: card.id,
    title: card.title,
    content: card.content,
    metadata: migrateMetadata(parseMetadataColumn(card.metadata)),
    savedToVault: card.savedToVault,
    folderId: card.folderId,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

/** The vault list only ever shows Cards that have actually been saved there — a Card
 *  created inside a Page (or by a generation) is page-local scratch content until its
 *  Save action runs (see schema.prisma's Card.savedToVault doc comment). */
export async function listCards(query?: string): Promise<Card[]> {
  const cards = await prisma.card.findMany({
    where: {
      savedToVault: true,
      ...(query
        ? {
            OR: [
              { title: { contains: query } },
              { content: { contains: query } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  return cards.map(serializeCard);
}

export async function getCard(id: string): Promise<Card | null> {
  const card = await prisma.card.findUnique({ where: { id } });
  return card ? serializeCard(card) : null;
}

/** Creates a Card directly in the vault (savedToVault defaults to true — see
 *  schema.prisma) — unlike a Page-local/Dock-local Card, there's no later "save"
 *  transition to enforce a title at, so it's required from the start here. */
export async function createCard(input: CreateCardInput): Promise<Card> {
  if (input.title.trim() === "") {
    throw new Error("A title is required to save a Card to the vault");
  }
  const metadata = input.metadata === undefined ? defaultMetadata() : cardMetadataV1Schema.parse(input.metadata);
  const card = await prisma.card.create({
    data: {
      title: input.title,
      content: input.content,
      metadata: JSON.stringify(metadata),
      folderId: input.folderId ?? null,
    },
  });
  return serializeCard(card);
}

/** Moves a Card to a different Folder (or to the vault root, if `folderId` is null). */
export async function moveCard(id: string, folderId: string | null): Promise<Card> {
  const card = await prisma.card.update({
    where: { id },
    data: { folderId },
  });
  return serializeCard(card);
}

/** Used both for a genuine vault Card rename (VaultView) and for a still page-local
 *  Dock Card's "writes straight through" editing (see dockCardService's doc comment
 *  on DockCard) — so blank is only rejected once the Card is actually savedToVault;
 *  a not-yet-saved Dock Card can still go blank freely, same as any other scratch
 *  content. */
export async function updateCard(
  id: string,
  input: UpdateCardInput,
): Promise<Card> {
  if (input.title !== undefined && input.title.trim() === "") {
    const existing = await prisma.card.findUniqueOrThrow({ where: { id } });
    if (existing.savedToVault) {
      throw new Error("A title is required to save a Card to the vault");
    }
  }
  const card = await prisma.card.update({
    where: { id },
    data: {
      title: input.title,
      content: input.content,
      ...(input.metadata !== undefined
        ? { metadata: JSON.stringify(cardMetadataV1Schema.parse(input.metadata)) }
        : {}),
    },
  });
  return serializeCard(card);
}

export async function deleteCard(id: string): Promise<void> {
  await prisma.card.delete({ where: { id } });
}

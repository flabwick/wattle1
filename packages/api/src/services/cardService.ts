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
  createdAt: Date;
  updatedAt: Date;
}): Card {
  return {
    id: card.id,
    title: card.title,
    content: card.content,
    metadata: migrateMetadata(parseMetadataColumn(card.metadata)),
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

export async function listCards(query?: string): Promise<Card[]> {
  const cards = await prisma.card.findMany({
    where: query
      ? {
          OR: [
            { title: { contains: query } },
            { content: { contains: query } },
          ],
        }
      : undefined,
    orderBy: { updatedAt: "desc" },
  });
  return cards.map(serializeCard);
}

export async function getCard(id: string): Promise<Card | null> {
  const card = await prisma.card.findUnique({ where: { id } });
  return card ? serializeCard(card) : null;
}

export async function createCard(input: CreateCardInput): Promise<Card> {
  const metadata = input.metadata === undefined ? defaultMetadata() : cardMetadataV1Schema.parse(input.metadata);
  const card = await prisma.card.create({
    data: {
      title: input.title,
      content: input.content,
      metadata: JSON.stringify(metadata),
    },
  });
  return serializeCard(card);
}

export async function updateCard(
  id: string,
  input: UpdateCardInput,
): Promise<Card> {
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

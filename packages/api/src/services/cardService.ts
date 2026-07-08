import type { Card, CreateCardInput, UpdateCardInput } from "@wattle/shared";
import { prisma } from "../db.js";

function serialize(card: {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}): Card {
  return {
    id: card.id,
    title: card.title,
    content: card.content,
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
  return cards.map(serialize);
}

export async function getCard(id: string): Promise<Card | null> {
  const card = await prisma.card.findUnique({ where: { id } });
  return card ? serialize(card) : null;
}

export async function createCard(input: CreateCardInput): Promise<Card> {
  const card = await prisma.card.create({
    data: { title: input.title, content: input.content },
  });
  return serialize(card);
}

export async function updateCard(
  id: string,
  input: UpdateCardInput,
): Promise<Card> {
  const card = await prisma.card.update({
    where: { id },
    data: { title: input.title, content: input.content },
  });
  return serialize(card);
}

export async function deleteCard(id: string): Promise<void> {
  await prisma.card.delete({ where: { id } });
}

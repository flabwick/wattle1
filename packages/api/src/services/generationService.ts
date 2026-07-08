import type { GenerationContextEntry, GenerateResponse } from "@wattle/shared";
import { prisma } from "../db.js";

/**
 * The Generation Rule (spec1.md Part 2 "Generation Rule (Context Visibility)" and
 * Part 3 MVP spec): everything in Pages above the triggering Card's Page, plus
 * everything above the triggering Card within its own Page. Nothing below.
 *
 * Page.order and PageCard.order both ascend from 0. A larger Page.order is a Page
 * higher in the stack ("above"); a larger PageCard.order is a Card further down the
 * page's own list, so "above" within a page means a *smaller* order value.
 */
export async function assembleContext(
  pageCardId: string,
): Promise<GenerationContextEntry[]> {
  const trigger = await prisma.pageCard.findUniqueOrThrow({
    where: { id: pageCardId },
    include: { page: true },
  });

  const [aboveInSamePage, cardsInPagesAbove] = await Promise.all([
    prisma.pageCard.findMany({
      where: { pageId: trigger.pageId, order: { lt: trigger.order } },
      orderBy: { order: "asc" },
      include: { card: true, page: true },
    }),
    prisma.pageCard.findMany({
      where: { page: { order: { gt: trigger.page.order } } },
      orderBy: [{ page: { order: "asc" } }, { order: "asc" }],
      include: { card: true, page: true },
    }),
  ]);

  const entries = [...cardsInPagesAbove, ...aboveInSamePage].map(
    (pc): GenerationContextEntry => ({
      pageId: pc.pageId,
      pageOrder: pc.page.order,
      pageCardId: pc.id,
      pageCardOrder: pc.order,
      title: pc.draftTitle ?? pc.card.title,
      content: pc.draftContent ?? pc.card.content,
    }),
  );

  entries.sort((a, b) => a.pageOrder - b.pageOrder || a.pageCardOrder - b.pageCardOrder);
  return entries;
}

/**
 * TODO: replace with a real model call (e.g. the Anthropic Messages API using
 * ANTHROPIC_API_KEY from the environment). Kept as a pure function of the assembled
 * context so swapping in a real provider doesn't touch any route or context-assembly
 * code above it.
 */
async function callModel(context: GenerationContextEntry[]): Promise<string> {
  const summary = context.map((c) => `- ${c.title}`).join("\n") || "(no context above)";
  return [
    "_Stub response — wire up a real model call in generationService.ts._",
    "",
    `Context received (${context.length} card${context.length === 1 ? "" : "s"}):`,
    summary,
  ].join("\n");
}

/** Generate from a Card: assemble context, call the model, append the result below it. */
export async function generateFromCard(pageCardId: string): Promise<GenerateResponse> {
  const trigger = await prisma.pageCard.findUniqueOrThrow({
    where: { id: pageCardId },
  });

  const context = await assembleContext(pageCardId);
  const responseText = await callModel(context);

  // Make room directly below the triggering card, then insert the new one there.
  await prisma.pageCard.updateMany({
    where: { pageId: trigger.pageId, order: { gt: trigger.order } },
    data: { order: { increment: 1 } },
  });

  const created = await prisma.pageCard.create({
    data: {
      pageId: trigger.pageId,
      order: trigger.order + 1,
      card: { create: { title: "Generated response", content: responseText } },
    },
    include: { card: true },
  });

  return {
    context,
    card: {
      id: created.card.id,
      title: created.card.title,
      content: created.card.content,
      createdAt: created.card.createdAt.toISOString(),
      updatedAt: created.card.updatedAt.toISOString(),
    },
    pageCard: {
      id: created.id,
      pageId: created.pageId,
      cardId: created.cardId,
      order: created.order,
      draftTitle: created.draftTitle,
      draftContent: created.draftContent,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
  };
}

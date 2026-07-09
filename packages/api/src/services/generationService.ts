import type { Chunk, GenerationContextEntry, GenerateResponse } from "@wattle/shared";
import { defaultMetadata, modelProviderRegistry } from "@wattle/shared";
import { promptTemplateRegistry } from "@wattle/prompt-engine";
import { prisma } from "../db.js";
import { activeProviderId } from "../providers/init.js";
import { serializeCard } from "./cardService.js";

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

/** Render a context via the shared "generate-from-context" prompt template. */
function buildPrompt(context: GenerationContextEntry[]): string {
  return promptTemplateRegistry.get("generate-from-context").render(context);
}

/**
 * Stream a model generation for an already-assembled context, via whichever
 * ModelProvider is active (see providers/init.ts — MODEL_PROVIDER env var). Exposed
 * separately from callModel so the streaming route can forward chunks as they arrive
 * instead of waiting for the full response.
 */
export function streamModel(context: GenerationContextEntry[]): AsyncIterable<Chunk> {
  const prompt = buildPrompt(context);
  const provider = modelProviderRegistry.get(activeProviderId());
  return provider.generate(prompt);
}

/** Non-streaming: consume the provider's chunks fully and concatenate the text. */
async function callModel(context: GenerationContextEntry[]): Promise<string> {
  let text = "";
  for await (const chunk of streamModel(context)) {
    text += chunk.text;
  }
  return text;
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
      page: { connect: { id: trigger.pageId } },
      order: trigger.order + 1,
      card: {
        create: {
          title: "Generated response",
          content: responseText,
          metadata: JSON.stringify(defaultMetadata()),
        },
      },
    },
    include: { card: true },
  });

  return {
    context,
    card: serializeCard(created.card),
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

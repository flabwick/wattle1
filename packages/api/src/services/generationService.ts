import type { GeneratedCardPart, GenerationContextEntry, GenerateResponse, PageCard } from "@wattle/shared";
import { cardTypeRegistry, defaultMetadata, modelProviderRegistry } from "@wattle/shared";
import type { CardBlockEvent } from "@wattle/prompt-engine";
import { CardBlockParser, compilePrompt } from "@wattle/prompt-engine";
import { prisma } from "../db.js";
import { activeProviderId } from "../providers/init.js";
import { configuredProviderSettings } from "../modelConfig.js";
import { serializeCard } from "./cardService.js";

/** Where a generation is anchored: either a specific triggering Card (insert directly
 *  below it, context is everything above it), or a Page with nothing selected (append
 *  at the bottom of the Page, context is everything already on it — see App.tsx's
 *  "nothing selected" Dock action). */
export type GenerationTarget =
  | { type: "card"; pageCardId: string }
  | { type: "page"; pageId: string };

/**
 * The Generation Rule (spec1.md Part 2 "Generation Rule (Context Visibility)" and
 * Part 3 MVP spec): everything in Pages above the target's Page, plus everything above
 * the target within its own Page. Nothing below.
 *
 * Page.order and PageCard.order both ascend from 0. A larger Page.order is a Page
 * higher in the stack ("above"); a larger PageCard.order is a Card further down the
 * page's own list, so "above" within a page means a *smaller* order value. A page-level
 * target (nothing selected, appending at the bottom of the Page) has no order of its
 * own to be "above" — every existing Card in that Page counts as context, same as a
 * card-level target whose own order is greater than all of them.
 */
async function assembleContextForTarget(
  target: GenerationTarget,
): Promise<GenerationContextEntry[]> {
  let pageId: string;
  let tabId: string;
  let pageOrder: number;
  let withinPageCutoff: number | null;

  if (target.type === "card") {
    const trigger = await prisma.pageCard.findUniqueOrThrow({
      where: { id: target.pageCardId },
      include: { page: true },
    });
    pageId = trigger.pageId;
    tabId = trigger.page.tabId;
    pageOrder = trigger.page.order;
    withinPageCutoff = trigger.order;
  } else {
    const page = await prisma.page.findUniqueOrThrow({ where: { id: target.pageId } });
    pageId = page.id;
    tabId = page.tabId;
    pageOrder = page.order;
    withinPageCutoff = null;
  }

  const [withinPage, cardsInPagesAbove] = await Promise.all([
    prisma.pageCard.findMany({
      where: { pageId, ...(withinPageCutoff !== null ? { order: { lt: withinPageCutoff } } : {}) },
      orderBy: { order: "asc" },
      include: { card: true, page: true },
    }),
    // Scoped to this same Tab — Tabs don't share generation context with each other
    // (Step 6 spec §1.1), so a higher-order Page in a *different* Tab must never
    // leak in here just because Page.order values aren't unique across Tabs.
    prisma.pageCard.findMany({
      where: { page: { tabId, order: { gt: pageOrder } } },
      orderBy: [{ page: { order: "asc" } }, { order: "asc" }],
      include: { card: true, page: true },
    }),
  ]);

  const entries = [...cardsInPagesAbove, ...withinPage].map(
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

/** Card-level preview (GET /api/generate/context/:pageCardId — spec1.md Part 1 §2). */
export function assembleContext(pageCardId: string): Promise<GenerationContextEntry[]> {
  return assembleContextForTarget({ type: "card", pageCardId });
}

/**
 * The sole model invocation for a generation ("collapse to one call" — there is no
 * separate preview call and persist call any more). Compiles the "generate" prompt,
 * streams the active ModelProvider's raw text through a CardBlockParser, and yields
 * that parser's events (open/text/close for the root card and any nested card blocks,
 * then a final done/error). Nothing is persisted here — the caller (the SSE route)
 * only forwards these events on to the frontend's local ghost-card state; persisting
 * only happens if/when the user explicitly accepts it (see persistGeneratedCard(ToPage)).
 */
async function* streamForTarget(
  target: GenerationTarget,
  instruction?: string,
): AsyncGenerator<CardBlockEvent> {
  const context = await assembleContextForTarget(target);
  // An instruction typed into the Feed Input Button's expanded text field (Step 6
  // spec §2.2) reuses the existing "interactive" prompt mode — it was already built
  // for exactly this "override instruction alongside the normal context" shape.
  const { systemPrompt, userMessage } = instruction
    ? compilePrompt({ mode: "interactive", context, overridePrompt: instruction })
    : compilePrompt({ mode: "generate", context });

  const providerId = activeProviderId();
  const provider = modelProviderRegistry.get(providerId);
  const settings = configuredProviderSettings(providerId);

  // TEMP DEBUG — remove once the truncated/unterminated-card-block issue is fully
  // characterized. Runs server-side (Node), so it only shows up in the terminal
  // running `npm run dev`/`npm run dev:api`, never in the browser console.
  console.log(
    `[gen] streamForTarget provider=${providerId} model=${settings?.model ?? "(default)"} maxTokens=${settings?.maxTokens ?? "(default)"}`,
  );

  const parser = new CardBlockParser();
  let rawText = "";
  let sawDoneChunk = false;
  for await (const chunk of provider.generate(userMessage, {
    systemPrompt,
    model: settings?.model,
    temperature: settings?.temperature,
    maxTokens: settings?.maxTokens,
  })) {
    rawText += chunk.text;
    for (const event of parser.push(chunk.text)) yield event;
    if (chunk.done) {
      sawDoneChunk = true;
      break;
    }
  }
  console.log(`[gen] provider stream ended (sawDoneChunk=${sawDoneChunk}), ${rawText.length} chars received total`);

  const finalEvents = parser.finish();
  // Only dump the full raw text when something notable happened — a hard failure, or
  // a recovered truncation — not on every ordinary successful generation, so this
  // doesn't flood the terminal in the common case.
  const notable = finalEvents.some((e) => e.type === "error" || (e.type === "done" && e.truncated));
  if (notable) {
    console.log(`[gen] raw model output (${rawText.length} chars):\n${rawText}`);
  }
  for (const event of finalEvents) yield event;
}

/** Card-level generation — GET /api/generate/stream/:pageCardId. */
export function streamGeneration(pageCardId: string, instruction?: string): AsyncGenerator<CardBlockEvent> {
  return streamForTarget({ type: "card", pageCardId }, instruction);
}

/** Page-level generation (nothing selected) — GET /api/generate/stream/page/:pageId. */
export function streamGenerationForPage(pageId: string, instruction?: string): AsyncGenerator<CardBlockEvent> {
  return streamForTarget({ type: "page", pageId }, instruction);
}

function isRegisteredCardType(id: string): boolean {
  return cardTypeRegistry.list().some((def) => def.id === id);
}

function buildMetadata(cardType?: string): ReturnType<typeof defaultMetadata> {
  const typeId = cardType && isRegisteredCardType(cardType) ? cardType : undefined;
  return { ...defaultMetadata(), ...(typeId ? { typeId } : {}) };
}

/**
 * Turns a ghost card's structured parts into the root's actual `content` string,
 * materializing every nested `<card>` block along the way as its own standalone Card
 * (page-local scratch, same as any other freshly-generated Card — see
 * persistGeneratedCard's savedToVault doc comment) and splicing a `[[cardId]]` embed
 * reference in its place — the exact syntax CardEmbed.tsx/parseCardRefs.ts already
 * render, so an accepted generation's nested cards behave like any other embedded Card
 * (independently viewable, editable, saveable) instead of surviving as literal XML
 * text. Recurses depth-first so a child's own nested children exist (and have real
 * ids) before the child itself is created.
 */
async function materializeParts(parts: GeneratedCardPart[]): Promise<string> {
  const pieces: string[] = [];
  for (const part of parts) {
    if (part.kind === "text") {
      pieces.push(part.text);
      continue;
    }
    const childContent = await materializeParts(part.parts);
    const child = await prisma.card.create({
      data: {
        title: part.title,
        content: childContent,
        metadata: JSON.stringify(buildMetadata(part.cardType)),
        savedToVault: false,
      },
    });
    // <wattle-embed>, not the old `[[cardId]]` bracket token — content is HTML now
    // (richText/cardEmbedNode.ts); the tag deliberately doesn't start with "card" so
    // it can never collide with this same stream's own <card>/</card> nesting syntax
    // (cardBlockParser.ts's TAG_REGEX).
    pieces.push(`<wattle-embed data-card-id="${child.id}"></wattle-embed>`);
  }
  return pieces.join("");
}

function buildResponse(
  context: GenerationContextEntry[],
  created: { id: string; pageId: string; cardId: string; order: number; draftTitle: string | null; draftContent: string | null; createdAt: Date; updatedAt: Date; card: Parameters<typeof serializeCard>[0] },
): GenerateResponse {
  const pageCard: PageCard = {
    id: created.id,
    pageId: created.pageId,
    cardId: created.cardId,
    order: created.order,
    draftTitle: created.draftTitle,
    draftContent: created.draftContent,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  };
  return { context, card: serializeCard(created.card), pageCard };
}

/**
 * Persists an already-generated root card directly below the triggering Card, in the
 * same page-local scratch state (savedToVault: false) any other new Card is created in.
 * No model call happens here — the model was already invoked once during streaming
 * (see streamGeneration above); this only accepts the finalized text the user reviewed
 * as a ghost card and chose to keep.
 */
export async function persistGeneratedCard(
  pageCardId: string,
  generated: { title: string; cardType?: string; parts: GeneratedCardPart[] },
): Promise<GenerateResponse> {
  const trigger = await prisma.pageCard.findUniqueOrThrow({ where: { id: pageCardId } });
  const context = await assembleContextForTarget({ type: "card", pageCardId });
  const metadata = buildMetadata(generated.cardType);
  const content = await materializeParts(generated.parts);

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
          title: generated.title,
          content,
          metadata: JSON.stringify(metadata),
          // Page-local scratch content like any other new Card, not yet a Vault
          // entry — see schema.prisma's Card.savedToVault doc comment.
          savedToVault: false,
        },
      },
    },
    include: { card: true },
  });

  return buildResponse(context, created);
}

/**
 * Persists an already-generated root card at the bottom of a Page — the "nothing
 * selected" counterpart to persistGeneratedCard above, used when the generation was
 * triggered with no specific Card selected (see streamGenerationForPage). No shifting
 * needed since it's always appended after everything already there.
 */
export async function persistGeneratedCardToPage(
  pageId: string,
  generated: { title: string; cardType?: string; parts: GeneratedCardPart[] },
): Promise<GenerateResponse> {
  const context = await assembleContextForTarget({ type: "page", pageId });
  const metadata = buildMetadata(generated.cardType);
  const content = await materializeParts(generated.parts);

  const bottom = await prisma.pageCard.aggregate({ where: { pageId }, _max: { order: true } });

  const created = await prisma.pageCard.create({
    data: {
      page: { connect: { id: pageId } },
      order: (bottom._max.order ?? -1) + 1,
      card: {
        create: {
          title: generated.title,
          content,
          metadata: JSON.stringify(metadata),
          savedToVault: false,
        },
      },
    },
    include: { card: true },
  });

  return buildResponse(context, created);
}

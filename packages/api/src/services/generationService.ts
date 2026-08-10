import type {
  GeneratedCardPart,
  GenerationContextEntry,
  GenerateResponse,
  PageCard,
  PromptCardContextMode,
  StackMember,
} from "@wattle/shared";
import {
  cardTypeRegistry,
  defaultMetadata,
  findEmbeddedCardIds,
  flattenToPlainText,
  htmlToDoc,
  migrateMetadata,
  modelProviderRegistry,
} from "@wattle/shared";
import type { CardBlockEvent } from "@wattle/prompt-engine";
import { CardBlockParser, compilePrompt } from "@wattle/prompt-engine";
import { prisma } from "../db.js";
import { activeProviderId } from "../providers/init.js";
import { configuredProviderSettings } from "../modelConfig.js";
import { serializeCard } from "./cardService.js";
import { getStackData, serializeMember } from "./stackService.js";
import * as nearbyService from "./nearbyService.js";

/** Where a generation is anchored: a specific triggering Card (insert directly below
 *  it, context is everything above it), a Page with nothing selected (append at the
 *  bottom of the Page, context is everything already on it — see App.tsx's "nothing
 *  selected" Dock action), or a blank Stack alternate (fills that alternate's own
 *  content in place rather than inserting a new sibling PageCard — see
 *  persistGeneratedToStackMember below; context is the same "everything above the
 *  Stack's own position" a card-level target at the container's PageCard would see). */
export type GenerationTarget =
  | { type: "card"; pageCardId: string }
  | { type: "page"; pageId: string }
  | { type: "stackMember"; memberId: string };

/**
 * The Generation Rule, redefined for the single-Page world (Pages + Links + Search
 * rebuild, Phase 3's "Redefine generation context" risk item): everything above the
 * target within its own Page. Nothing below, and nothing from any other Page —
 * "everything below in the Tab stack" no longer means anything once a Page isn't
 * scoped to one (the rebuild plan calls this "a deliberate cut… pick a simple v1
 * (current Page only, then expand)"; a linked-neighborhood expansion is future work,
 * not a v1 requirement).
 *
 * PageCard.order ascends from 0, so "above" within a Page means a *smaller* order
 * value. A page-level target (nothing selected, appending at the bottom of the Page)
 * has no order of its own to be "above" — every existing Card on that Page counts as
 * context, same as a card-level target whose own order is greater than all of them.
 */
async function assembleContextForTarget(
  target: GenerationTarget,
): Promise<GenerationContextEntry[]> {
  let pageId: string;
  let withinPageCutoff: number | null;

  if (target.type === "card") {
    const trigger = await prisma.pageCard.findUniqueOrThrow({ where: { id: target.pageCardId } });
    pageId = trigger.pageId;
    withinPageCutoff = trigger.order;
  } else if (target.type === "stackMember") {
    // Same cutoff a card-level target at the *container's* own PageCard would use —
    // generating into one alternate should see exactly what generating into the
    // Stack's position in the Page would, not anything from the Stack's other
    // alternates (which resolveContextContent below would otherwise fold in via the
    // container's own contribution — moot here since a target's own PageCard is
    // always excluded from its context regardless).
    const member = await prisma.stackMember.findUniqueOrThrow({ where: { id: target.memberId } });
    const containerPageCard = await prisma.pageCard.findFirstOrThrow({ where: { cardId: member.stackCardId } });
    pageId = containerPageCard.pageId;
    withinPageCutoff = containerPageCard.order;
  } else {
    pageId = target.pageId;
    withinPageCutoff = null;
  }

  const withinPage = await prisma.pageCard.findMany({
    where: { pageId, ...(withinPageCutoff !== null ? { order: { lt: withinPageCutoff } } : {}) },
    orderBy: { order: "asc" },
    include: { card: true, page: true },
  });

  const entries = await Promise.all(
    withinPage.map(async (pc): Promise<GenerationContextEntry> => {
      const { title, content } = await resolveContextContent(pc);
      return {
        pageId: pc.pageId,
        pageOrder: pc.page.order,
        pageCardId: pc.id,
        pageCardOrder: pc.order,
        title,
        content,
      };
    }),
  );

  return entries;
}

/** What a PageCard contributes to generation context — ordinarily just its own
 *  (draft-aware) title/content, but a "stack"-typed PageCard has none of its own to
 *  give: per the Generation Rule extended to Stacks, only the currently *visible*
 *  member counts as "in view", so this resolves straight through to that member's own
 *  (also draft-aware) title/content instead of the container's permanently-blank
 *  ones. An empty Stack (no members at all) contributes nothing. */
async function resolveContextContent(pc: {
  cardId: string;
  draftTitle: string | null;
  draftContent: string | null;
  card: { title: string; content: string; metadata: string };
}): Promise<{ title: string; content: string }> {
  const meta = migrateMetadata(JSON.parse(pc.card.metadata));
  if (meta.typeId !== "stack") {
    return { title: pc.draftTitle ?? pc.card.title, content: pc.draftContent ?? pc.card.content };
  }
  const stack = await getStackData(pc.cardId);
  const active = stack.members[stack.activeIndex];
  if (!active) return { title: "", content: "" };
  return {
    title: active.draftTitle ?? active.card.title,
    content: active.draftContent ?? active.card.content,
  };
}

/** Which Page (and, where there's one obvious answer, which Card) a generation target
 *  belongs to — reuses the same target-to-Page resolution assembleContextForTarget
 *  does above, just without the "everything above" cutoff this doesn't need. Feeds
 *  buildNearbyAppendix below. */
async function resolveTargetPageContext(
  target: GenerationTarget,
): Promise<{ pageId: string; focusedCardId?: string }> {
  if (target.type === "card") {
    const trigger = await prisma.pageCard.findUniqueOrThrow({ where: { id: target.pageCardId } });
    return { pageId: trigger.pageId, focusedCardId: trigger.cardId };
  }
  if (target.type === "stackMember") {
    const member = await prisma.stackMember.findUniqueOrThrow({ where: { id: target.memberId } });
    const containerPageCard = await prisma.pageCard.findFirstOrThrow({ where: { cardId: member.stackCardId } });
    return { pageId: containerPageCard.pageId, focusedCardId: member.stackCardId };
  }
  return { pageId: target.pageId };
}

/** A single extra block appended to the compiled prompt: titles + summaries only
 *  (never full Card content) for the top Nearby results at this target's Page —
 *  Wattle vault plan's "first cut" of feeding Nearby into Generate, deliberately not
 *  the doc's recursive "peel deeper" ring-expansion (a separate, larger feature).
 *  Best-effort: a failure here (or nothing to say) must never break a generation. */
async function buildNearbyAppendix(target: GenerationTarget): Promise<string> {
  try {
    const { pageId, focusedCardId } = await resolveTargetPageContext(target);
    const items = await nearbyService.getLiveNearby({ pageId, focusedCardId, limit: 5 });
    if (items.length === 0) return "";
    const list = items.map((item) => `- ${item.title || "Untitled"}: ${item.summary}`).join("\n");
    return `\n\n---\nRelated Cards you may want to be aware of (not shown in full, summaries only):\n${list}`;
  } catch {
    return "";
  }
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
/** Expands every `<wattle-embed data-card-id="...">` inside an instruction (an
 *  Action Card's configured Prompt Card instructions, or in principle any future
 *  instruction source) into that Card's actual title + plain-text content, appended
 *  after the instruction's own flattened text — a `[[cardId]]`-era embed contributes
 *  *nothing* to flattenToPlainText by design (see richText/plainText.ts), so without
 *  this the model would just see an empty gap where the reference was. Referenced
 *  Cards that no longer exist are silently skipped, same "don't fail the whole
 *  generation over a dangling reference" convention as this app's other embed
 *  lookups (CardEmbed.tsx). */
async function resolveInstructionEmbeds(instructionHtml: string): Promise<string> {
  const doc = htmlToDoc(instructionHtml);
  const plain = flattenToPlainText(doc).text;
  const cardIds = findEmbeddedCardIds(doc);
  if (cardIds.length === 0) return plain;

  const cards = await prisma.card.findMany({ where: { id: { in: cardIds } } });
  const byId = new Map(cards.map((c) => [c.id, c]));
  const resolved = cardIds
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
    .map((c) => `### ${c.title || "Untitled"}\n${flattenToPlainText(htmlToDoc(c.content)).text}`)
    .join("\n\n");

  return resolved ? `${plain}\n\n${resolved}` : plain;
}

/** The shared tail every prompt-compilation path streams through: calls the active
 *  ModelProvider with an already-compiled {systemPrompt, userMessage} pair, pushes its
 *  raw text through a CardBlockParser, and yields that parser's events. Split out of
 *  streamForTarget so the prompt-card/quick-lookup generators below (which compile
 *  their own prompts against different context rules — see assemblePromptCardContext)
 *  can reuse this same provider/parser plumbing and logging instead of duplicating it. */
async function* streamCompiledPrompt(systemPrompt: string, userMessage: string): AsyncGenerator<CardBlockEvent> {
  const providerId = activeProviderId();
  const provider = modelProviderRegistry.get(providerId);
  const settings = configuredProviderSettings(providerId);

  // TEMP DEBUG — remove once the truncated/unterminated-card-block issue is fully
  // characterized. Runs server-side (Node), so it only shows up in the terminal
  // running `npm run dev`/`npm run dev:api`, never in the browser console.
  console.log(
    `[gen] streamCompiledPrompt provider=${providerId} model=${settings?.model ?? "(default)"} maxTokens=${settings?.maxTokens ?? "(default)"}`,
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

async function* streamForTarget(
  target: GenerationTarget,
  instruction?: string,
  /** True for the "promptCard" action job's "on its own" context mode (lib/actionJobs.ts
   *  on the web side) — skips the Generation Rule entirely (renderContext's own "(no
   *  context above)" placeholder degrades gracefully to this) so the model sees only
   *  the instruction. Distinct from the "prompt" CardType's own generation
   *  (streamPromptCardGeneration below), which has its own four-way context mode. */
  standalone?: boolean,
  /** The runnable-action vocabulary, pre-rendered client-side (@wattle/web's
   *  lib/actionScriptPrompt.ts) — only meaningful alongside `instruction` (only
   *  "interactive" mode's own prompt has anywhere to splice it), see
   *  InteractiveModeInput.actionsDoc's own doc comment. Lets this generation's model
   *  respond with a self-running "action" card and chain into the next round of the
   *  "guide the next generation" pipeline (App.tsx's onGenerationAccepted) — see
   *  prompts/interactive/system.md's "Action cards" section. */
  actionsDoc?: string,
): AsyncGenerator<CardBlockEvent> {
  const context = standalone ? [] : await assembleContextForTarget(target);
  const resolvedInstruction = instruction ? await resolveInstructionEmbeds(instruction) : undefined;
  // An instruction typed into the Feed Input Button's expanded text field (Step 6
  // spec §2.2), or the "promptCard" action job, reuses the existing "interactive"
  // prompt mode — it was already built for exactly this "override instruction
  // alongside the normal context" shape (context is just empty in standalone mode).
  const { systemPrompt, userMessage } = resolvedInstruction
    ? compilePrompt({ mode: "interactive", context, overridePrompt: resolvedInstruction, actionsDoc })
    : compilePrompt({ mode: "generate", context });
  const nearbyAppendix = standalone ? "" : await buildNearbyAppendix(target);
  yield* streamCompiledPrompt(systemPrompt, `${userMessage}${nearbyAppendix}`);
}

/** Card-level generation — GET /api/generate/stream/:pageCardId. `standalone` is
 *  only ever true for a Prompt Card's "on its own" job (lib/actionJobs.ts on the web
 *  side) — every other caller (Dock's Generate, the Feed Input Button) omits it. */
export function streamGeneration(
  pageCardId: string,
  instruction?: string,
  standalone?: boolean,
  actionsDoc?: string,
): AsyncGenerator<CardBlockEvent> {
  return streamForTarget({ type: "card", pageCardId }, instruction, standalone, actionsDoc);
}

/** Page-level generation (nothing selected) — GET /api/generate/stream/page/:pageId. */
export function streamGenerationForPage(
  pageId: string,
  instruction?: string,
  actionsDoc?: string,
): AsyncGenerator<CardBlockEvent> {
  return streamForTarget({ type: "page", pageId }, instruction, undefined, actionsDoc);
}

/** A blank Stack alternate's own generation — GET
 *  /api/generate/stream/stack-member/:memberId (StackBody.tsx's Feed Input Button,
 *  shown in place of the alternate's body while it's still blank). */
export function streamGenerationForStackMember(
  memberId: string,
  instruction?: string,
  actionsDoc?: string,
): AsyncGenerator<CardBlockEvent> {
  return streamForTarget({ type: "stackMember", memberId }, instruction, undefined, actionsDoc);
}

/** The "prompt" CardType's own four context modes (cardMetadata.ts's
 *  `prompt.context`) — deliberately *not* the directional Generation Rule every other
 *  generation in the app follows (assembleContextForTarget above): "page" here means
 *  *every* Card on the current Page, regardless of position, since a Prompt Card is
 *  asking a question about its surroundings, not continuing from a fixed point in
 *  them. "tab" (kept as a PromptCardContextMode value for backward compatibility, but
 *  no longer Tab-scoped now that Tab isn't a place — see schema.prisma's own doc
 *  comment) means every Card across this Page's `siblingGroupId` — the former Tab
 *  stack, or any explicit next/prev trail — falling back to just this Page when it
 *  has no group. "cards" is an explicit, order-independent list picked by the user
 *  (PromptCardBody.tsx's context-settings popover); "none" (the default) matches this
 *  CardType's original standalone-only behavior. Returns the minimal {title, content}
 *  shape compilePrompt actually consumes, not the heavier GenerationContextEntry (which
 *  exists only to power the context-preview endpoint/GenerateResponse — neither of
 *  which a Prompt Card's generation surfaces). */
async function assemblePromptCardContext(
  pageCardId: string,
  mode: PromptCardContextMode,
  cardIds: string[],
): Promise<{ title: string; content: string }[]> {
  if (mode === "none") return [];

  if (mode === "cards") {
    if (cardIds.length === 0) return [];
    const cards = await prisma.card.findMany({ where: { id: { in: cardIds } } });
    return cards.map((c) => ({ title: c.title, content: c.content }));
  }

  const trigger = await prisma.pageCard.findUniqueOrThrow({
    where: { id: pageCardId },
    include: { page: true },
  });
  const scopeWhere =
    mode === "page" || !trigger.page.siblingGroupId
      ? { pageId: trigger.pageId }
      : { page: { siblingGroupId: trigger.page.siblingGroupId } };
  const pageCards = await prisma.pageCard.findMany({
    where: scopeWhere,
    orderBy: [{ page: { orderInGroup: "asc" } }, { order: "asc" }],
    include: { card: true, page: true },
  });
  // Excludes the Prompt Card's own PageCard — it has nothing useful to say about
  // itself as "context" (its own content is just the prompt input/history).
  const others = pageCards.filter((pc) => pc.id !== pageCardId);
  return Promise.all(others.map((pc) => resolveContextContent(pc)));
}

/** The "prompt" CardType's own generation — GET
 *  /api/generate/stream/prompt-card/:pageCardId. Reuses the "interactive" prompt mode
 *  (the typed prompt is an override instruction, same shape the Feed Input Button's
 *  guided text and the "promptCard" action job already use) against whichever context
 *  mode the Card is configured for, instead of streamForTarget's directional Generation
 *  Rule / fixed standalone-or-not choice. */
export function streamPromptCardGeneration(
  pageCardId: string,
  input: string,
  contextMode: PromptCardContextMode,
  contextCardIds: string[],
): AsyncGenerator<CardBlockEvent> {
  return (async function* () {
    const context = await assemblePromptCardContext(pageCardId, contextMode, contextCardIds);
    const { systemPrompt, userMessage } = compilePrompt({ mode: "interactive", context, overridePrompt: input });
    yield* streamCompiledPrompt(systemPrompt, userMessage);
  })();
}

/** The text-selection quick-lookup popup's generation — GET
 *  /api/generate/stream/lookup. Not tied to any Card/PageCard at all: no context is
 *  assembled (confirmed default — a lookup should be fast and self-contained), and
 *  nothing is ever persisted server-side for it — the popup holds the result as local
 *  state until the user explicitly adds it to the Page or Dock (ordinary Card-creation
 *  calls at that point, not a generation-acceptance one). */
export function streamSelectionLookup(selectedText: string, instruction?: string): AsyncGenerator<CardBlockEvent> {
  const { systemPrompt, userMessage } = compilePrompt({ mode: "selection", context: [], selectedText, instruction });
  return streamCompiledPrompt(systemPrompt, userMessage);
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

/**
 * Fills a blank Stack alternate's own content in place — the Stack counterpart to
 * persistGeneratedCard/persistGeneratedCardToPage above, but it never creates a new
 * PageCard: the member already exists (as a blank draft, added via the rail's "+" —
 * see StackBody.tsx), so this just writes the generated title/content straight onto
 * its own Card, exactly like a fresh member's initial content would be set, and
 * clears any (empty) pending draft. Deliberately ignores `generated.cardType` for
 * the member itself — unlike a plain generated Card, whose own type the model's
 * suggested root cardType can set, a Stack member's type must never move off "note"
 * (no code path lets one become "stack" — see stackService.addMember's doc
 * comment); `cardType` only still applies to any *nested* `<card>` blocks
 * materializeParts splices in as embeds, which are unrelated standalone Cards.
 */
export async function persistGeneratedToStackMember(
  memberId: string,
  generated: { title: string; cardType?: string; parts: GeneratedCardPart[] },
): Promise<StackMember> {
  const member = await prisma.stackMember.findUniqueOrThrow({ where: { id: memberId } });
  const content = await materializeParts(generated.parts);

  await prisma.card.update({
    where: { id: member.cardId },
    data: { title: generated.title, content },
  });
  const cleared = await prisma.stackMember.update({
    where: { id: memberId },
    data: { draftTitle: null, draftContent: null },
  });
  return serializeMember(cleared);
}

import { randomUUID } from "node:crypto";
import type { Annotation, Card } from "@wattle/shared";
import { annotationSchema, cardMetadataV1Schema, migrateMetadata, modelProviderRegistry } from "@wattle/shared";
import type { AnnotationProcess, AnnotationTargetCard, RawAnnotationEntry } from "@wattle/prompt-engine";
import { compileAnnotationPrompt, parseAnnotationResponse } from "@wattle/prompt-engine";
import { prisma } from "../db.js";
import { activeProviderId } from "../providers/init.js";
import { configuredProviderSettings } from "../modelConfig.js";
import { serializeCard } from "./cardService.js";

export type { AnnotationProcess } from "@wattle/prompt-engine";

/** A selection-scoped run's input — the one Card it's anchored to, plus the exact text
 *  the user selected inside it (App.tsx's SelectionMenu). Distinct from a whole-card
 *  run, which scopes to the Card's full content plus every nested Card. */
export interface AnnotationSelection {
  cardId: string;
  text: string;
}

/** Same `[[cardId]]` token CardEmbed.tsx renders and parseCardRefs.ts (web-only)
 *  parses — duplicated server-side, same reasoning as generationService.ts's own
 *  standalone materialization logic: no shared parsing lib between web/api today. */
const CARD_REF_PATTERN = /\[\[([a-zA-Z0-9_-]+)\]\]/g;

/** Hard cap on nesting depth for scope resolution — mirrors CardEmbed.tsx's
 *  MAX_EMBED_DEPTH, so a whole-card annotation run's scope matches what a user would
 *  actually see rendered for that Card. */
const MAX_SCOPE_DEPTH = 4;

type CardRow = Awaited<ReturnType<typeof prisma.card.findUniqueOrThrow>>;

function toCard(row: CardRow): Card {
  return serializeCard(row);
}

async function loadCard(cardId: string): Promise<CardRow> {
  return prisma.card.findUniqueOrThrow({ where: { id: cardId } });
}

/** Where a mutation (accept a diff) should land: a specific PageCard's `draftContent`
 *  (still page-local scratch, not yet saved — schema.prisma's Card.savedToVault doc
 *  comment) if one is active, or the vault Card's own `content` otherwise. */
interface DraftTarget {
  content: string;
  /** Non-null iff writes should go through PageCard.draftContent instead of
   *  Card.content — see writeDraftTarget. */
  pageCardId: string | null;
}

/**
 * Resolves the "effective" content of a top-level Card the user has open — the same
 * draftContent-over-real-content fallback Card.tsx's own rendering and
 * generationService.ts's assembleContextForTarget already use (schema.prisma's
 * Card.savedToVault doc comment: a Card opened on a Page stays page-local scratch,
 * edited only as a PageCard draft, until its first explicit Save). Annotation actions
 * need this too: a not-yet-saved Card's real `Card.content` row can be empty or stale
 * while what the user is actually looking at (and selecting text from) is the draft.
 * Only the *root* of a whole-card scope can have a draft — nested/embedded Cards
 * always write straight through to the vault (CardEmbed.tsx), never via a draft — so
 * this is only ever called for the root, never recursively.
 */
async function resolveDraftTarget(
  cardId: string,
  fallbackContent: string,
  pageCardId?: string,
): Promise<DraftTarget> {
  if (!pageCardId) return { content: fallbackContent, pageCardId: null };
  const pageCard = await prisma.pageCard.findUnique({ where: { id: pageCardId } });
  if (!pageCard || pageCard.cardId !== cardId || pageCard.draftContent === null) {
    return { content: fallbackContent, pageCardId: null };
  }
  return { content: pageCard.draftContent, pageCardId };
}

/** Read-only convenience over resolveDraftTarget, for the (more common) call sites
 *  that only need to check/send the effective content, never write it back. */
async function resolveRootContent(
  cardId: string,
  fallbackContent: string,
  pageCardId?: string,
): Promise<string> {
  return (await resolveDraftTarget(cardId, fallbackContent, pageCardId)).content;
}

/** Persists a content mutation (accepting a diff) to wherever resolveDraftTarget said
 *  it should land, plus the metadata update every annotation mutation carries — the
 *  draft-aware counterpart to patchAnnotations below (which never touches content). */
async function writeDraftTarget(
  cardId: string,
  draft: DraftTarget,
  newContent: string,
  nextMetadata: ReturnType<typeof migrateMetadata>,
): Promise<Card> {
  if (draft.pageCardId) {
    await prisma.pageCard.update({ where: { id: draft.pageCardId }, data: { draftContent: newContent } });
  }
  const updated = await prisma.card.update({
    where: { id: cardId },
    data: {
      ...(draft.pageCardId ? {} : { content: newContent }),
      metadata: JSON.stringify(cardMetadataV1Schema.parse(nextMetadata)),
    },
  });
  return toCard(updated);
}

/**
 * The scope of a whole-card annotation run (spec: "the selected card and, if that card
 * has nested cards, all nested cards within it as well"): the root Card plus every
 * Card it embeds via `[[cardId]]`, recursively, depth-first — same traversal
 * CardContent.tsx/CardEmbed.tsx do for rendering, re-implemented here since this
 * package can't import web/lib. Cycle-safe (an `ancestorIds` guard, not just a depth
 * cap) and returns both the flat prompt input and a cardId -> real content map the
 * caller uses to verify anchors afterward. `rootPageCardId`, if given, resolves the
 * root's *effective* (draft-aware) content — see resolveRootContent above.
 */
async function resolveScopeCards(
  rootCardId: string,
  rootPageCardId?: string,
): Promise<{ targets: AnnotationTargetCard[]; contentByCardId: Map<string, string> }> {
  const targets: AnnotationTargetCard[] = [];
  const contentByCardId = new Map<string, string>();

  async function visit(cardId: string, ancestorIds: ReadonlySet<string>, depth: number): Promise<void> {
    if (ancestorIds.has(cardId) || depth > MAX_SCOPE_DEPTH) return;
    const row = await prisma.card.findUnique({ where: { id: cardId } });
    if (!row) return;

    const content =
      depth === 0 ? await resolveRootContent(cardId, row.content, rootPageCardId) : row.content;
    targets.push({ cardId: row.id, title: row.title, content });
    contentByCardId.set(row.id, content);

    const childIds = new Set([...content.matchAll(CARD_REF_PATTERN)].map((m) => m[1]));
    const childAncestors = new Set([...ancestorIds, cardId]);
    for (const childId of childIds) {
      await visit(childId, childAncestors, depth + 1);
    }
  }

  await visit(rootCardId, new Set(), 0);
  return { targets, contentByCardId };
}

/** The sole model invocation for an annotation run — compiles the process's prompt,
 *  calls the active ModelProvider (same lookup generationService.ts uses), and
 *  accumulates the full response into one string. Unlike generation, these responses
 *  are short JSON arrays, not long-form content, so there's no need for the SSE
 *  streaming/ghost-card machinery generationService.ts uses — one blocking call is
 *  simpler and sufficient. */
async function callModel(process: AnnotationProcess, cards: AnnotationTargetCard[]): Promise<string> {
  const { systemPrompt, userMessage } = compileAnnotationPrompt({ process, cards });

  const providerId = activeProviderId();
  const provider = modelProviderRegistry.get(providerId);
  const settings = configuredProviderSettings(providerId);

  // TEMP DEBUG — remove once the annotation-run-doesn't-do-anything issue is
  // diagnosed. This runs server-side (Node), so it only shows up in the terminal
  // running `npm run dev`/`npm run dev:api`, never in the browser console.
  console.log(`[annot] callModel(${process}) provider=${providerId} model=${settings?.model ?? "(default)"}`);
  console.log(`[annot] callModel(${process}) userMessage:\n${userMessage}`);

  let text = "";
  try {
    for await (const chunk of provider.generate(userMessage, {
      systemPrompt,
      model: settings?.model,
      temperature: settings?.temperature,
      maxTokens: settings?.maxTokens,
    })) {
      text += chunk.text;
      if (chunk.done) break;
    }
  } catch (err) {
    console.log(`[annot] callModel(${process}) provider THREW:`, err);
    throw err;
  }
  console.log(`[annot] callModel(${process}) raw response (${text.length} chars):\n${text}`);
  return text;
}

/** Turns one syntactically-valid raw entry into a full Annotation, or null if it
 *  fails the semantic check ("does this anchor actually appear in the real content it
 *  claims to belong to") or its type-specific payload doesn't validate — both cases
 *  are dropped silently, per spec, not surfaced as an error. */
function buildAnnotation(
  process: AnnotationProcess,
  entry: RawAnnotationEntry,
  realContent: string | undefined,
): Annotation | null {
  if (realContent === undefined) {
    // TEMP DEBUG — remove once diagnosed.
    console.log(`[annot] buildAnnotation(${process}) DROPPED — cardId "${entry.cardId}" not in scope`, entry);
    return null;
  }
  if (!realContent.includes(entry.anchor)) {
    console.log(
      `[annot] buildAnnotation(${process}) DROPPED — anchor ${JSON.stringify(entry.anchor)} not found in cardId "${entry.cardId}"'s content:\n${realContent}`,
    );
    return null;
  }

  const base = { id: randomUUID(), anchor: entry.anchor, createdAt: new Date().toISOString() };
  const candidate =
    process === "diff"
      ? { ...base, type: "diff" as const, replacement: entry.replacement }
      : process === "footnote"
        ? { ...base, type: "footnote" as const, text: entry.text }
        : { ...base, type: "highlight" as const, color: entry.color, text: entry.text };

  const parsed = annotationSchema.safeParse(candidate);
  if (!parsed.success) {
    console.log(`[annot] buildAnnotation(${process}) DROPPED — failed schema validation`, {
      candidate,
      issues: parsed.error.issues,
    });
    return null;
  }
  console.log(`[annot] buildAnnotation(${process}) ACCEPTED`, parsed.data);
  return parsed.data;
}

/** Appends `newAnnotations` to a Card's metadata.annotations and persists — the one
 *  place every accept/reject/run/edit path below writes metadata, so they all go
 *  through the same parse -> mutate -> stringify -> save round trip. */
async function patchAnnotations(
  cardId: string,
  mutate: (metadata: ReturnType<typeof migrateMetadata>) => ReturnType<typeof migrateMetadata>,
): Promise<Card> {
  const row = await loadCard(cardId);
  const metadata = mutate(migrateMetadata(JSON.parse(row.metadata || "{}")));
  const updated = await prisma.card.update({
    where: { id: cardId },
    data: { metadata: JSON.stringify(cardMetadataV1Schema.parse(metadata)) },
  });
  return toCard(updated);
}

/**
 * Runs an AI annotation process against a whole Card (+ its nested Cards) or a single
 * selection within one Card. Returns the updated Card for every Card that actually
 * received a new annotation — none, if every proposed entry failed its anchor check.
 */
export async function runAnnotationProcess(
  process: AnnotationProcess,
  targetCardId: string,
  selection?: AnnotationSelection,
  targetPageCardId?: string,
): Promise<Card[]> {
  let targets: AnnotationTargetCard[];
  let contentByCardId: Map<string, string>;

  if (selection) {
    // selection.text already *is* the effective (draft-aware) text the user selected
    // from their own rendered view — no separate draft lookup needed here.
    const row = await loadCard(selection.cardId);
    targets = [{ cardId: row.id, title: row.title, content: selection.text }];
    contentByCardId = new Map([[row.id, selection.text]]);
  } else {
    const scope = await resolveScopeCards(targetCardId, targetPageCardId);
    targets = scope.targets;
    contentByCardId = scope.contentByCardId;
  }

  // TEMP DEBUG — remove once diagnosed.
  console.log(
    `[annot] runAnnotationProcess(${process}) scope: ${targets.map((t) => `${t.cardId}(${t.content.length} chars)`).join(", ") || "(empty)"}`,
  );
  if (targets.length === 0) {
    console.log(`[annot] runAnnotationProcess(${process}) ABORTED — empty scope, no model call made`);
    return [];
  }

  const raw = await callModel(process, targets);
  const entries = parseAnnotationResponse(raw);
  console.log(
    `[annot] runAnnotationProcess(${process}) parsed ${entries.length} syntactically-valid entr${entries.length === 1 ? "y" : "ies"} from the model's response`,
    entries,
  );
  if (entries.length === 0 && raw.trim() !== "[]") {
    console.log(
      `[annot] runAnnotationProcess(${process}) parseAnnotationResponse returned 0 entries from a non-"[]" response — likely malformed JSON or wrapped in prose/markdown the model added despite instructions not to`,
    );
  }

  const byCard = new Map<string, Annotation[]>();
  for (const entry of entries) {
    const annotation = buildAnnotation(process, entry, contentByCardId.get(entry.cardId));
    if (!annotation) continue;
    const list = byCard.get(entry.cardId) ?? [];
    list.push(annotation);
    byCard.set(entry.cardId, list);
  }

  const updated: Card[] = [];
  for (const [cardId, newAnnotations] of byCard) {
    // A selection-scoped run always anchors against the real Card's full content, not
    // the (possibly stale-by-now) selection snapshot — re-checking here would be
    // redundant with buildAnnotation's check against `selection.text`, but persisting
    // must still land on the live row, which patchAnnotations' loadCard does.
    const card = await patchAnnotations(cardId, (metadata) => ({
      ...metadata,
      annotations: [...metadata.annotations, ...newAnnotations],
    }));
    updated.push(card);
  }
  return updated;
}

/** Manually-triggered highlight (text-selection context menu, no AI call — the user
 *  already delimited the exact span). Still verifies the anchor is an exact substring
 *  of the Card's *current* content before trusting it: the selection was made
 *  client-side and the content may have changed since. */
export async function createManualHighlight(
  cardId: string,
  anchor: string,
  color: string,
  text?: string,
  pageCardId?: string,
): Promise<Card> {
  const row = await loadCard(cardId);
  const effectiveContent = await resolveRootContent(cardId, row.content, pageCardId);
  if (!effectiveContent.includes(anchor)) {
    throw new Error("Selected text no longer matches this Card's content");
  }
  const annotation: Annotation = {
    id: randomUUID(),
    type: "highlight",
    anchor,
    color,
    text,
    createdAt: new Date().toISOString(),
  };
  return patchAnnotations(cardId, (metadata) => ({
    ...metadata,
    annotations: [...metadata.annotations, annotation],
  }));
}

/** Applies one pending diff's replacement to the Card's real content, records the
 *  pre-change text in diffHistory (for a future undo feature — not built yet, see
 *  cardMetadata.ts), and removes the annotation. Throws (a real error, not a silent
 *  drop) if the annotation isn't a pending diff on this Card, or its anchor no longer
 *  matches — unlike a model's own output, this is a direct, explicit user action, so a
 *  failure here should be visible, not swallowed. */
export async function acceptDiff(
  cardId: string,
  annotationId: string,
  pageCardId?: string,
): Promise<Card> {
  const row = await loadCard(cardId);
  const metadata = migrateMetadata(JSON.parse(row.metadata || "{}"));
  const annotation = metadata.annotations.find((a) => a.id === annotationId);
  if (!annotation || annotation.type !== "diff") {
    throw new Error("No pending diff with that id on this Card");
  }

  const draft = await resolveDraftTarget(cardId, row.content, pageCardId);
  if (!draft.content.includes(annotation.anchor)) {
    throw new Error("This diff's anchor no longer matches the Card's content");
  }

  const content = draft.content.replace(annotation.anchor, annotation.replacement);
  const nextMetadata = {
    ...metadata,
    annotations: metadata.annotations.filter((a) => a.id !== annotationId),
    diffHistory: [
      ...metadata.diffHistory,
      {
        anchor: annotation.anchor,
        original: annotation.anchor,
        replacement: annotation.replacement,
        acceptedAt: new Date().toISOString(),
      },
    ],
  };

  return writeDraftTarget(cardId, draft, content, nextMetadata);
}

/**
 * Applies every pending diff on a Card in one pass ("accept all" — the Dock's batch
 * control). Diffs are applied back-to-front by anchor position so accepting one never
 * shifts another still-pending anchor's offset; any diff whose anchor no longer
 * exact-matches by the time its turn comes is skipped silently, same "drop on
 * mismatch" rule that governs the model's own output, extended to this apply step.
 */
export async function acceptAllDiffs(cardId: string, pageCardId?: string): Promise<Card> {
  const row = await loadCard(cardId);
  const metadata = migrateMetadata(JSON.parse(row.metadata || "{}"));
  const diffs = metadata.annotations.filter((a) => a.type === "diff");

  const draft = await resolveDraftTarget(cardId, row.content, pageCardId);

  const positioned = diffs
    .map((d) => ({ diff: d, index: draft.content.indexOf(d.anchor) }))
    .filter((d) => d.index !== -1)
    .sort((a, b) => b.index - a.index);

  let content = draft.content;
  const acceptedIds = new Set<string>();
  const newHistory: (typeof metadata.diffHistory)[number][] = [];
  for (const { diff } of positioned) {
    if (diff.type !== "diff") continue;
    if (!content.includes(diff.anchor)) continue; // may have been invalidated by an earlier replacement
    content = content.replace(diff.anchor, diff.replacement);
    acceptedIds.add(diff.id);
    newHistory.push({
      anchor: diff.anchor,
      original: diff.anchor,
      replacement: diff.replacement,
      acceptedAt: new Date().toISOString(),
    });
  }

  const nextMetadata = {
    ...metadata,
    annotations: metadata.annotations.filter((a) => !acceptedIds.has(a.id)),
    diffHistory: [...metadata.diffHistory, ...newHistory],
  };

  return writeDraftTarget(cardId, draft, content, nextMetadata);
}

/** Rejects a pending diff, or removes a footnote/highlight — one function, since all
 *  three are "strip the entry from the array, no content change." No separate reject
 *  state for any of them: removal is permanent, per spec. */
export async function removeAnnotation(cardId: string, annotationId: string): Promise<Card> {
  return patchAnnotations(cardId, (metadata) => ({
    ...metadata,
    annotations: metadata.annotations.filter((a) => a.id !== annotationId),
  }));
}

/** Edits a footnote's or highlight's user-editable text in place. Not valid for a
 *  diff (it has no `text` field) or for changing an anchor/color/replacement — this is
 *  narrowly the "user tweaks the AI's wording" action from the spec. */
export async function updateAnnotationText(
  cardId: string,
  annotationId: string,
  text: string,
): Promise<Card> {
  return patchAnnotations(cardId, (metadata) => ({
    ...metadata,
    annotations: metadata.annotations.map((a) =>
      a.id === annotationId && (a.type === "footnote" || a.type === "highlight") ? { ...a, text } : a,
    ),
  }));
}

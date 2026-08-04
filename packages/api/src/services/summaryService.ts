import { flattenToPlainText, htmlToDoc, migrateMetadata, modelProviderRegistry } from "@wattle/shared";
import { compileSummaryPrompt } from "@wattle/prompt-engine";
import { prisma } from "../db.js";
import { activeProviderId } from "../providers/init.js";
import { configuredProviderSettings } from "../modelConfig.js";

/** Bounds prompt cost — a summary only needs to see this much of a Card, not its
 *  entire content. */
const MAX_CONTENT_CHARS = 4000;
/** How long a Card's content has to sit untouched before its summary actually
 *  regenerates — coalesces a fast-typing keystroke stream (cardService.updateCard
 *  fires on every PATCH) into one call per pause, instead of one per character. */
const DEBOUNCE_MS = 3000;

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** The sole model invocation for a summary refresh — same "one blocking call,
 *  accumulate the full response" shape annotationService.ts's callModel uses, since a
 *  one-or-two-sentence summary needs no streaming/ghost-card machinery either. Never
 *  throws: best-effort, logs and leaves the Card's existing summary in place on any
 *  failure (a stale or missing summary degrades Nearby gracefully; a thrown error
 *  reaching the caller — a live keystroke edit or a Save — would not). */
export async function refreshSummary(cardId: string): Promise<void> {
  try {
    const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } });
    const plainText = flattenToPlainText(htmlToDoc(card.content)).text.slice(0, MAX_CONTENT_CHARS);

    if (plainText.trim() === "") {
      const metadata = migrateMetadata(JSON.parse(card.metadata));
      if (metadata.summary !== undefined) {
        await prisma.card.update({
          where: { id: cardId },
          data: { metadata: JSON.stringify({ ...metadata, summary: undefined }) },
        });
      }
      return;
    }

    const { systemPrompt, userMessage } = compileSummaryPrompt(plainText);
    const providerId = activeProviderId();
    const provider = modelProviderRegistry.get(providerId);
    const settings = configuredProviderSettings(providerId);

    let summary = "";
    for await (const chunk of provider.generate(userMessage, {
      systemPrompt,
      model: settings?.model,
      temperature: settings?.temperature,
      maxTokens: 200,
    })) {
      summary += chunk.text;
      if (chunk.done) break;
    }
    summary = summary.trim();
    if (summary === "") return;

    // Re-read metadata fresh rather than reusing the row fetched above — content may
    // have moved on again while this call was in flight (this can run several
    // seconds after being scheduled), but `summary` is derived from a stale content
    // snapshot regardless; accepted as a soft, eventually-consistent signal, same as
    // the rest of Nearby.
    const latest = await prisma.card.findUniqueOrThrow({ where: { id: cardId } });
    const latestMetadata = migrateMetadata(JSON.parse(latest.metadata));
    await prisma.card.update({
      where: { id: cardId },
      data: { metadata: JSON.stringify({ ...latestMetadata, summary }) },
    });
  } catch (err) {
    console.error(`[summaryService] refreshSummary(${cardId}) failed:`, err);
  }
}

/** Debounced entry point for the live-editing path (cardService.updateCard, fired on
 *  every keystroke via the shared cardStore) — see DEBOUNCE_MS. Fire-and-forget: the
 *  caller doesn't await this, same reasoning as refreshSummary's own try/catch. */
export function scheduleSummaryRefresh(cardId: string): void {
  const existing = pending.get(cardId);
  if (existing) clearTimeout(existing);
  pending.set(
    cardId,
    setTimeout(() => {
      pending.delete(cardId);
      void refreshSummary(cardId);
    }, DEBOUNCE_MS),
  );
}

import { z } from "zod";
import type { Card, Operation } from "@wattle/shared";
import * as cardService from "../services/cardService.js";
import * as fileExtractionService from "../services/fileExtractionService.js";

const payloadSchema = z.object({
  cardId: z.string(),
  // .optional() rather than .default(...) — a Zod schema with a default has
  // mismatched input/output types, which doesn't satisfy the ZodSchema<TPayload>
  // (input === output) constraint Operation.payloadSchema requires; defaulting to
  // "auto" happens in execute() below instead.
  method: z.enum(["auto", "textLayer", "ocr"]).optional(),
  instructions: z.string().max(2000).optional(),
});

/**
 * Extracts a "file" Card's text (PDF text layer, or AI vision OCR via OpenRouter —
 * fileExtractionService.ts) and caches it on the Card's own metadata.file.extraction,
 * returning the updated Card — one atomic call, same "mutate one Card, return the
 * new row" shape every other Operation has. Synchronous by design (no job queue):
 * bounded by fileExtractionService's page/size/timeout limits, so it never runs
 * behind the HTTP request indefinitely.
 */
export const fileExtractTextOperation: Operation<z.infer<typeof payloadSchema>, Card> = {
  id: "file.extractText",
  payloadSchema,
  execute: async (_ctx, payload) => {
    const card = await cardService.getCard(payload.cardId);
    if (!card) throw new Error("Card not found");
    const file = card.metadata.file;
    if (!file) throw new Error("Card has no uploaded file");

    const outcome = await fileExtractionService.extractFileText(file, {
      method: payload.method ?? "auto",
      instructions: payload.instructions,
    });

    return cardService.updateCard(payload.cardId, {
      metadata: {
        ...card.metadata,
        file: {
          ...file,
          extraction: {
            text: outcome.text,
            method: outcome.method,
            model: outcome.model,
            pageCount: outcome.pageCount,
            truncated: outcome.truncated,
            instructions: payload.instructions,
            extractedAt: new Date().toISOString(),
          },
        },
      },
    });
  },
};

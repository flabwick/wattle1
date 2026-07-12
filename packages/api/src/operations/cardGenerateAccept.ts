import { z } from "zod";
import type { GeneratedCardPart, GenerateResponse, Operation } from "@wattle/shared";
import * as generationService from "../services/generationService.js";

const generatedPartSchema: z.ZodType<GeneratedCardPart> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("text"), text: z.string() }),
    z.object({
      kind: z.literal("child"),
      cardType: z.string(),
      title: z.string(),
      parts: z.array(generatedPartSchema),
    }),
  ]),
);

// Accepting a streamed generation's ghost card (POST /api/generate/accept). The model
// was already invoked once during streaming (generationService.streamGeneration /
// streamGenerationForPage) — this only persists the already-generated text the user
// reviewed and chose to keep. Exactly one of pageCardId (a Card was selected — insert
// directly below it) or pageId (nothing was selected — append at the bottom of the
// Page) must be given, mirroring the two streaming endpoints. `parts` carries the root
// card's content in stream order, with nested `<card>` blocks kept structured (not
// flattened back into literal markup) so generationService can materialize each one as
// its own standalone Card and splice a `[[cardId]]` embed reference in its place.
const payloadSchema = z
  .object({
    pageCardId: z.string().optional(),
    pageId: z.string().optional(),
    title: z.string(),
    cardType: z.string().optional(),
    parts: z.array(generatedPartSchema),
  })
  .refine((data) => Boolean(data.pageCardId) !== Boolean(data.pageId), {
    message: "Exactly one of pageCardId or pageId must be provided",
  });

export const cardGenerateAcceptOperation: Operation<
  z.infer<typeof payloadSchema>,
  GenerateResponse
> = {
  id: "card.generateAccept",
  payloadSchema,
  execute: async (_ctx, payload) => {
    const generated = { title: payload.title, cardType: payload.cardType, parts: payload.parts };
    return payload.pageCardId
      ? generationService.persistGeneratedCard(payload.pageCardId, generated)
      : generationService.persistGeneratedCardToPage(payload.pageId!, generated);
  },
};

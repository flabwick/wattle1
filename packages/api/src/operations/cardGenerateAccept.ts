import { z } from "zod";
import type { GenerateResponse, Operation } from "@wattle/shared";
import * as generationService from "../services/generationService.js";

// Accepting a streamed generation's ghost card (POST /api/generate/accept). The model
// was already invoked once during streaming (generationService.streamGeneration /
// streamGenerationForPage) — this only persists the already-generated text the user
// reviewed and chose to keep. Exactly one of pageCardId (a Card was selected — insert
// directly below it) or pageId (nothing was selected — append at the bottom of the
// Page) must be given, mirroring the two streaming endpoints.
const payloadSchema = z
  .object({
    pageCardId: z.string().optional(),
    pageId: z.string().optional(),
    title: z.string(),
    content: z.string(),
    cardType: z.string().optional(),
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
    const generated = { title: payload.title, content: payload.content, cardType: payload.cardType };
    return payload.pageCardId
      ? generationService.persistGeneratedCard(payload.pageCardId, generated)
      : generationService.persistGeneratedCardToPage(payload.pageId!, generated);
  },
};

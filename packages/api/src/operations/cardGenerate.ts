import { z } from "zod";
import type { GenerateResponse, Operation } from "@wattle/shared";
import * as generationService from "../services/generationService.js";

// Triggering a generation from a Card (POST /api/generate).
const payloadSchema = z.object({
  pageCardId: z.string(),
});

export const cardGenerateOperation: Operation<z.infer<typeof payloadSchema>, GenerateResponse> = {
  id: "card.generate",
  payloadSchema,
  execute: async (_ctx, payload) => {
    return generationService.generateFromCard(payload.pageCardId);
  },
};

import { z } from "zod";
import type { Operation, PageCard } from "@wattle/shared";
import * as pageCardService from "../services/pageCardService.js";

// Persisting a PageCard's draft edits back to its vault Card (POST /api/page-cards/:id/save).
const payloadSchema = z.object({
  id: z.string(),
});

export const cardSaveOperation: Operation<z.infer<typeof payloadSchema>, PageCard> = {
  id: "card.save",
  payloadSchema,
  execute: async (_ctx, payload) => {
    return pageCardService.saveToVault(payload.id);
  },
};

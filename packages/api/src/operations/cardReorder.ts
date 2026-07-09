import { z } from "zod";
import type { Operation } from "@wattle/shared";
import * as pageCardService from "../services/pageCardService.js";

// Reordering Cards within a Page (PUT /api/pages/:pageId/cards/reorder).
const payloadSchema = z.object({
  pageId: z.string(),
  orderedIds: z.array(z.string()),
});

export const cardReorderOperation: Operation<z.infer<typeof payloadSchema>, void> = {
  id: "card.reorder",
  payloadSchema,
  execute: async (_ctx, payload) => {
    await pageCardService.reorderPageCards(payload.pageId, payload.orderedIds);
  },
};

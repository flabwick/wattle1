import { z } from "zod";
import type { Operation } from "@wattle/shared";
import * as cardService from "../services/cardService.js";

// Deleting a vault Card entirely (DELETE /api/cards/:id).
const payloadSchema = z.object({
  id: z.string(),
});

export const cardDeleteOperation: Operation<z.infer<typeof payloadSchema>, void> = {
  id: "card.delete",
  payloadSchema,
  execute: async (_ctx, payload) => {
    await cardService.deleteCard(payload.id);
  },
};

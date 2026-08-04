import { z } from "zod";
import type { Card, Operation } from "@wattle/shared";
import * as cardService from "../services/cardService.js";

// Freezing a vault Card — read-only from here on, safe as stable context (Wattle
// vault plan's Open/Frozen). Wraps cardService.freezeCard.
const payloadSchema = z.object({
  cardId: z.string(),
});

export const cardFreezeOperation: Operation<z.infer<typeof payloadSchema>, Card> = {
  id: "card.freeze",
  payloadSchema,
  execute: async (_ctx, payload) => {
    return cardService.freezeCard(payload.cardId);
  },
};

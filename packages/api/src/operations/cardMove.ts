import { z } from "zod";
import type { Card, Operation } from "@wattle/shared";
import * as cardService from "../services/cardService.js";

// Moving a vault Card into a different Folder — null folderId means "move to the vault
// root". Distinct from "card.rename", which only ever touches title/content.
const payloadSchema = z.object({
  id: z.string(),
  folderId: z.string().nullable(),
});

export const cardMoveOperation: Operation<z.infer<typeof payloadSchema>, Card> = {
  id: "card.move",
  payloadSchema,
  execute: async (_ctx, payload) => {
    return cardService.moveCard(payload.id, payload.folderId);
  },
};

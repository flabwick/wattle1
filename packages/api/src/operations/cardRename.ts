import { z } from "zod";
import type { Card, Operation } from "@wattle/shared";
import * as cardService from "../services/cardService.js";

// Renaming/editing a vault Card directly (PATCH /api/cards/:id), as opposed to
// "card.edit" which edits a Card's in-page draft (see cardEdit.ts). `metadata` is
// unvalidated here (cardService.updateCard runs it through cardMetadataV1Schema) —
// needed so a type-specific Editor can persist its own metadata field through this
// same endpoint, same as cardService.updateCard already supports.
const payloadSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  metadata: z.unknown().optional(),
});

export const cardRenameOperation: Operation<z.infer<typeof payloadSchema>, Card> = {
  id: "card.rename",
  payloadSchema,
  execute: async (_ctx, payload) => {
    return cardService.updateCard(payload.id, {
      title: payload.title,
      content: payload.content,
      metadata: payload.metadata,
    });
  },
};

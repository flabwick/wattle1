import { z } from "zod";
import type { Operation, PageCard } from "@wattle/shared";
import * as pageCardService from "../services/pageCardService.js";

// Inline-editing a Card's in-page draft (PATCH /api/page-cards/:id). Stored as a draft
// until "card.save" persists it back to the vault.
const payloadSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
});

export const cardEditOperation: Operation<z.infer<typeof payloadSchema>, PageCard> = {
  id: "card.edit",
  payloadSchema,
  execute: async (_ctx, payload) => {
    return pageCardService.updateDraft(payload.id, {
      title: payload.title,
      content: payload.content,
    });
  },
};

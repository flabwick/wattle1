import { z } from "zod";
import type { DockCardWithCard, Operation, PageCard } from "@wattle/shared";
import * as pageCardService from "../services/pageCardService.js";
import * as dockCardService from "../services/dockCardService.js";

// Editing a Frozen Card always forks (Wattle vault plan's Open/Frozen) — forks the
// Frozen Card the given occurrence points at, then repoints just that occurrence at
// the new fork. `location` picks which table owns the occurrence, since a PageCard
// and a DockCard are separate rows with no shared id space.
const payloadSchema = z.discriminatedUnion("location", [
  z.object({ location: z.literal("page"), pageCardId: z.string() }),
  z.object({ location: z.literal("dock"), dockCardId: z.string() }),
]);

export const cardForkOccurrenceOperation: Operation<
  z.infer<typeof payloadSchema>,
  PageCard | DockCardWithCard
> = {
  id: "card.forkOccurrence",
  payloadSchema,
  execute: async (_ctx, payload) => {
    return payload.location === "page"
      ? pageCardService.forkOccurrence(payload.pageCardId)
      : dockCardService.forkOccurrence(payload.dockCardId);
  },
};

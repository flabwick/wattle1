import { z } from "zod";
import type { CardTypeDefinition } from "../cardType.js";

/**
 * A whole-card search box — one of two modes: "vault" (Pages + Cards, the same
 * search the Vault panel itself runs — see cardService.listCards/pageService.
 * searchPages) or "web" (Tavily, gated on TAVILY_API_KEY — see
 * webSearchService.ts). See cardMetadata.ts's `search` field for the actual
 * per-Card data (just the mode + query — results are always fetched live, never
 * persisted); this only describes the type's shape.
 */
export const searchCardDataSchema = z.object({
  mode: z.enum(["vault", "web"]),
  query: z.string(),
});

export type SearchCardData = z.infer<typeof searchCardDataSchema>;

export const searchCardTypeDefinition: CardTypeDefinition<SearchCardData> = {
  id: "search",
  displayName: "Search",
  dataSchema: searchCardDataSchema,
  defaultData: () => ({ mode: "vault", query: "" }),
  // Same rationale as pageLinksCardType.ts: running a search isn't an
  // Operation-registry concern, and Save/Delete are the only vault-level operations
  // that make sense against a card whose whole content is a live query.
  supportsOperations: ["card.save", "card.delete"],
};

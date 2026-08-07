import { z } from "zod";
import type { CardTypeDefinition } from "../cardType.js";

/**
 * A whole-card navigation aid (Pages + Links + Search rebuild) — one or more links to
 * other Pages, rendered as a short list of destinations rather than composed into a
 * Card's own rich text the way a `pageLink` node (richText/pageLinkNode.ts) is. The
 * natural way to build a deliberate hub Page by hand — see cardMetadata.ts's
 * `pageLinks` field for the actual per-Card data; this only describes the type's
 * shape. `title` is cached per target the same way a `pageLink` node caches one, so a
 * row has something to show before any live Page data is fetched.
 */
export const pageLinksCardDataSchema = z.object({
  targets: z.array(z.object({ pageId: z.string(), title: z.string() })),
});

export type PageLinksCardData = z.infer<typeof pageLinksCardDataSchema>;

export const pageLinksCardTypeDefinition: CardTypeDefinition<PageLinksCardData> = {
  id: "pageLinks",
  displayName: "Page Links",
  dataSchema: pageLinksCardDataSchema,
  defaultData: () => ({ targets: [] }),
  // Same rationale as actionCardType.ts: navigating isn't an Operation-registry
  // concern, and Save/Delete are the only vault-level operations that make sense
  // against a card whose whole content is a target list.
  supportsOperations: ["card.save", "card.delete"],
};

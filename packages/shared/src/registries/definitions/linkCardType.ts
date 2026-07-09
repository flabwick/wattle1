import { z } from "zod";
import type { CardTypeDefinition } from "../cardType.js";

/**
 * Second CardType, registered alongside "note" purely to prove the registry supports
 * more than one (see docs on the C0 milestone). Nothing creates a Card of this type
 * yet — no API route, no UI picker — so its shape is a placeholder, not a commitment.
 */
export const linkCardDataSchema = z.object({
  title: z.string(),
  url: z.string(),
});

export type LinkCardData = z.infer<typeof linkCardDataSchema>;

export const linkCardTypeDefinition: CardTypeDefinition<LinkCardData> = {
  id: "link",
  displayName: "Link",
  dataSchema: linkCardDataSchema,
  defaultData: () => ({ title: "", url: "" }),
  supportsOperations: ["card.edit", "card.delete"],
};

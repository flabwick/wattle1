import { z } from "zod";
import type { CardTypeDefinition } from "../cardType.js";

/**
 * A whole-card form control — a single question (the Card's own `title`, same
 * convention `link`/`pageLinks` already use) plus one of several answerable widgets
 * (text/textarea/number/checkbox/radio/dropdown/multiSelect/combobox). See
 * cardMetadata.ts's `input` field for the actual per-Card data (kind/options/
 * placeholder/value); this only describes the type's shape.
 */
export const inputCardDataSchema = z.object({});

export type InputCardData = z.infer<typeof inputCardDataSchema>;

export const inputCardTypeDefinition: CardTypeDefinition<InputCardData> = {
  id: "input",
  displayName: "Input",
  dataSchema: inputCardDataSchema,
  defaultData: () => ({}),
  // Same rationale as pageLinksCardType.ts/searchCardType.ts: answering a form
  // control isn't an Operation-registry concern, and Save/Delete are the only
  // vault-level operations that make sense against it.
  supportsOperations: ["card.save", "card.delete"],
};

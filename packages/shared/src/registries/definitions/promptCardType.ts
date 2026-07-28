import { z } from "zod";
import type { CardTypeDefinition } from "../cardType.js";

/**
 * A self-contained input/output box: typed instructions in, a standalone (no Page
 * context — see generationService.ts's `standalone` flag) AI completion streamed
 * back and saved in place below it. Distinct from the "promptCard" *action job*
 * (lib/actionJobs.ts) — that job triggers a normal generation that lands as a new
 * sibling Card; this CardType's own send action keeps the output in this same
 * Card instead (PromptCardBody.tsx/usePromptGeneration.ts). See cardMetadata.ts's
 * `prompt` field for the actual per-Card data (input/output); this only describes
 * the type's shape.
 */
export const promptCardDataSchema = z.object({
  input: z.string(),
});

export type PromptCardData = z.infer<typeof promptCardDataSchema>;

export const promptCardTypeDefinition: CardTypeDefinition<PromptCardData> = {
  id: "prompt",
  displayName: "Prompt",
  dataSchema: promptCardDataSchema,
  defaultData: () => ({ input: "" }),
  supportsOperations: ["card.save", "card.delete"],
};

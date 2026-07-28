import { z } from "zod";
import type { CardTypeDefinition } from "../cardType.js";

/**
 * The whole-card counterpart to an inline actionButton node
 * (richText/actionButtonNode.ts) — a Card whose entire content is one calibrated
 * job button, placeable directly on a Page/in the Dock/vault instead of only
 * embedded inside a note's rich text. See cardMetadata.ts's `action` field for the
 * actual per-Card data (label/jobId/jobParams); this only describes the type's shape.
 */
export const actionCardDataSchema = z.object({
  label: z.string(),
  jobId: z.string().nullable(),
});

export type ActionCardData = z.infer<typeof actionCardDataSchema>;

export const actionCardTypeDefinition: CardTypeDefinition<ActionCardData> = {
  id: "action",
  displayName: "Action",
  dataSchema: actionCardDataSchema,
  defaultData: () => ({ label: "", jobId: null }),
  // Job-firing itself isn't gated through the Operation registry — same "ad hoc,
  // not an Operation" precedent as Stack's own Move/Delete Dock actions
  // (registries/README.md). Save/Delete are the only real vault-level operations
  // that make sense against a single calibrated button.
  supportsOperations: ["card.save", "card.delete"],
};

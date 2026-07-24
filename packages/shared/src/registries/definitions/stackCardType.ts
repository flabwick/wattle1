import { z } from "zod";
import type { CardTypeDefinition } from "../cardType.js";

/** A "stack" Card holds no title/content of its own — see schema.prisma's StackMember
 *  and cardMetadata.ts's `stack.activeIndex`, which is what this dataSchema mirrors. */
export const stackCardDataSchema = z.object({
  activeIndex: z.number().int().min(0),
});

export type StackCardData = z.infer<typeof stackCardDataSchema>;

export const stackCardTypeDefinition: CardTypeDefinition<StackCardData> = {
  id: "stack",
  displayName: "Stack",
  dataSchema: stackCardDataSchema,
  defaultData: () => ({ activeIndex: 0 }),
  // A Stack container has no text of its own to edit/generate/rename, and can never
  // be saved to the Vault itself (only its members can, individually — see
  // stackService.ts) — so no Operation id applies to the container at all. Its two
  // real actions, Delete Stack and Move, are both ad hoc Dock actions
  // (operationId: null), same precedent as every other structural placement/deletion
  // action (registries/README.md), not gated through this list.
  supportsOperations: [],
};

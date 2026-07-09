import { z } from "zod";
import type { CardTypeDefinition } from "../cardType.js";

/** The data shape of the one existing card type: a plain title+markdown Card. */
export const noteCardDataSchema = z.object({
  title: z.string(),
  content: z.string(),
});

export type NoteCardData = z.infer<typeof noteCardDataSchema>;

export const noteCardTypeDefinition: CardTypeDefinition<NoteCardData> = {
  id: "note",
  displayName: "Note",
  dataSchema: noteCardDataSchema,
  defaultData: () => ({ title: "", content: "" }),
  supportsOperations: ["*"],
};

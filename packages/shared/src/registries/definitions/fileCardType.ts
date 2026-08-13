import { z } from "zod";
import type { CardTypeDefinition } from "../cardType.js";

/**
 * An uploaded file, attached to a Page the same way a note Card is (see the Dock's
 * upload action). Its actual bytes live on disk under the API's uploads dir —
 * see cardMetadata.ts's `file` field — not in `dataSchema` here, which only covers
 * what a Card of this type looks like once loaded, not how it's created.
 */
export const fileCardDataSchema = z.object({
  filename: z.string(),
});

export type FileCardData = z.infer<typeof fileCardDataSchema>;

export const fileCardTypeDefinition: CardTypeDefinition<FileCardData> = {
  id: "file",
  displayName: "File",
  dataSchema: fileCardDataSchema,
  defaultData: () => ({ filename: "" }),
  // No "card.edit"/"card.generate" — a file Card's content isn't text to edit or
  // generate from. No "card.rename" either: renaming would desync from the actual
  // uploaded filename shown in the Card. "file.extractText" is this type's own
  // addition — see fileExtractionService.ts/FileView.tsx's own extract/OCR buttons.
  supportsOperations: ["card.save", "card.delete", "file.extractText"],
};

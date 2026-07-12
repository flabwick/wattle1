import { z } from "zod";
import type { Folder, Operation } from "@wattle/shared";
import * as folderService from "../services/folderService.js";

// Reparenting a Folder — null parentId means "move to the vault root".
const payloadSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
});

export const folderMoveOperation: Operation<z.infer<typeof payloadSchema>, Folder> = {
  id: "folder.move",
  payloadSchema,
  execute: async (_ctx, payload) => {
    return folderService.moveFolder(payload.id, payload.parentId);
  },
};

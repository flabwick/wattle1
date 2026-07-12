import { z } from "zod";
import type { Folder, Operation } from "@wattle/shared";
import * as folderService from "../services/folderService.js";

const payloadSchema = z.object({
  id: z.string(),
  title: z.string(),
});

export const folderRenameOperation: Operation<z.infer<typeof payloadSchema>, Folder> = {
  id: "folder.rename",
  payloadSchema,
  execute: async (_ctx, payload) => {
    return folderService.renameFolder(payload.id, payload.title);
  },
};

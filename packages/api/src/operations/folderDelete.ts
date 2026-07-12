import { z } from "zod";
import type { Operation } from "@wattle/shared";
import * as folderService from "../services/folderService.js";

const payloadSchema = z.object({
  id: z.string(),
});

export const folderDeleteOperation: Operation<z.infer<typeof payloadSchema>, void> = {
  id: "folder.delete",
  payloadSchema,
  execute: async (_ctx, payload) => {
    await folderService.deleteFolder(payload.id);
  },
};

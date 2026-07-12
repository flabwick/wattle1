import { Router } from "express";
import type { Folder } from "@wattle/shared";
import * as folderService from "../services/folderService.js";
import { runOperation } from "../operations/run.js";

export const foldersRouter = Router();

// GET /api/folders/contents?folderId=<id>  — a folder's immediate subfolders + Cards,
// plus its breadcrumb. Omit folderId (or pass nothing) for the vault root.
foldersRouter.get("/contents", async (req, res) => {
  const folderId = typeof req.query.folderId === "string" ? req.query.folderId : null;
  res.json(await folderService.listFolderContents(folderId));
});

foldersRouter.post("/", async (req, res) => {
  const { title, parentId } = req.body ?? {};
  if (typeof title !== "string") {
    return res.status(400).json({ error: "title is required" });
  }
  res.status(201).json(await folderService.createFolder(title, typeof parentId === "string" ? parentId : null));
});

foldersRouter.patch("/:id", async (req, res) => {
  const payload = { id: req.params.id, title: req.body?.title };
  res.json(await runOperation<Folder>("folder.rename", payload));
});

foldersRouter.patch("/:id/move", async (req, res) => {
  const payload = { id: req.params.id, parentId: req.body?.parentId ?? null };
  res.json(await runOperation<Folder>("folder.move", payload));
});

foldersRouter.delete("/:id", async (req, res) => {
  await runOperation<void>("folder.delete", { id: req.params.id });
  res.status(204).end();
});

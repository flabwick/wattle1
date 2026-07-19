import { Router } from "express";
import * as tabService from "../services/tabService.js";

// Mounted at /api/tabs — the horizontal layer above Pages (Step 6 spec §1.1).
export const tabsRouter = Router();

tabsRouter.get("/", async (_req, res) => {
  res.json(await tabService.listTabs());
});

tabsRouter.post("/", async (req, res) => {
  const { title } = req.body ?? {};
  res.status(201).json(await tabService.createTab(typeof title === "string" ? title : undefined));
});

tabsRouter.delete("/:id", async (req, res) => {
  await tabService.deleteTab(req.params.id);
  res.status(204).end();
});

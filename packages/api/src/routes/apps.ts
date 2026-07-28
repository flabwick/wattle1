import { Router } from "express";
import * as appService from "../services/appService.js";

// Mounted at /api/apps — reusable Tab/Page templates (Apps feature spec). Snapshots
// are always built/consumed server-side (appService.ts): a request only ever
// references a Tab or Page by id, never sends a snapshot payload itself.

export const appsRouter = Router();

// GET /api/apps — the App browser's list (lightweight: no snapshot payload).
appsRouter.get("/", async (_req, res) => {
  res.json(await appService.listApps());
});

// GET /api/apps/:id — a single App including its full snapshot.
appsRouter.get("/:id", async (req, res) => {
  const app = await appService.getApp(req.params.id);
  if (!app) return res.status(404).json({ error: "App not found" });
  res.json(app);
});

// POST /api/apps  { name, description?, tabId | pageId } — "Save as App": builds and
// stores a snapshot from the referenced Tab (scope "tab") or Page (scope "page").
appsRouter.post("/", async (req, res) => {
  const { name, description, tabId, pageId } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  res.status(201).json(
    await appService.createApp({
      name,
      description: typeof description === "string" ? description : null,
      tabId: typeof tabId === "string" ? tabId : undefined,
      pageId: typeof pageId === "string" ? pageId : undefined,
    }),
  );
});

// PUT /api/apps/:id  { tabId | pageId } — re-save while editingAppId is set: rebuilds
// the snapshot in place. Rejected server-side for any isCore App.
appsRouter.put("/:id", async (req, res) => {
  const { tabId, pageId } = req.body ?? {};
  res.json(
    await appService.updateAppSnapshot(req.params.id, {
      tabId: typeof tabId === "string" ? tabId : undefined,
      pageId: typeof pageId === "string" ? pageId : undefined,
    }),
  );
});

// DELETE /api/apps/:id — rejected server-side for any isCore App.
appsRouter.delete("/:id", async (req, res) => {
  await appService.deleteApp(req.params.id);
  res.status(204).end();
});

// POST /api/apps/:id/open  { tabId? } — instantiates a fresh, independent copy: a new
// Tab (scope "tab") or a new Page appended to `tabId` (scope "page", where `tabId` is
// then required).
appsRouter.post("/:id/open", async (req, res) => {
  const { tabId } = req.body ?? {};
  res.status(201).json(
    await appService.openApp(req.params.id, { tabId: typeof tabId === "string" ? tabId : undefined }),
  );
});

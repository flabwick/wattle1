import { Router } from "express";
import * as templateService from "../services/templateService.js";

// Mounted at /api/templates — reusable Tab/Page templates. Snapshots are always
// built/consumed server-side (templateService.ts): a request only ever references a
// Tab or Page by id, never sends a snapshot payload itself.

export const templatesRouter = Router();

// GET /api/templates — the Template browser's list (lightweight: no snapshot payload).
templatesRouter.get("/", async (_req, res) => {
  res.json(await templateService.listTemplates());
});

// GET /api/templates/:id — a single Template including its full snapshot.
templatesRouter.get("/:id", async (req, res) => {
  const template = await templateService.getTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: "Template not found" });
  res.json(template);
});

// POST /api/templates  { name, description?, tabId | pageId } — "Save as Template":
// builds and stores a snapshot from the referenced Tab (scope "tab") or Page
// (scope "page").
templatesRouter.post("/", async (req, res) => {
  const { name, description, tabId, pageId } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  res.status(201).json(
    await templateService.createTemplate({
      name,
      description: typeof description === "string" ? description : null,
      tabId: typeof tabId === "string" ? tabId : undefined,
      pageId: typeof pageId === "string" ? pageId : undefined,
    }),
  );
});

// PUT /api/templates/:id  { tabId | pageId } — re-save while editingTemplateId is
// set: rebuilds the snapshot in place. Rejected server-side for any isCore Template.
templatesRouter.put("/:id", async (req, res) => {
  const { tabId, pageId } = req.body ?? {};
  res.json(
    await templateService.updateTemplateSnapshot(req.params.id, {
      tabId: typeof tabId === "string" ? tabId : undefined,
      pageId: typeof pageId === "string" ? pageId : undefined,
    }),
  );
});

// DELETE /api/templates/:id — rejected server-side for any isCore Template.
templatesRouter.delete("/:id", async (req, res) => {
  await templateService.deleteTemplate(req.params.id);
  res.status(204).end();
});

// POST /api/templates/:id/open — instantiates a fresh, independent copy, landing on
// one Page to navigate straight to (a hub Page for scope "tab", a loose new Page for
// scope "page" — neither needs a destination any more, see templateService.openTemplate).
templatesRouter.post("/:id/open", async (req, res) => {
  res.status(201).json(await templateService.openTemplate(req.params.id, {}));
});

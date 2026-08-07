import { Router } from "express";
import * as settingsService from "../services/settingsService.js";

// Mounted at /api/settings — Home (Phase 4: "which Page is Home" lives here, not as
// a Page.isHome flag — see schema.prisma's UserSettings doc comment).
export const settingsRouter = Router();

settingsRouter.get("/", async (_req, res) => {
  res.json(await settingsService.getSettings());
});

settingsRouter.put("/home", async (req, res) => {
  const { pageId } = req.body ?? {};
  if (pageId !== null && typeof pageId !== "string") {
    return res.status(400).json({ error: "pageId must be a string or null" });
  }
  res.json(await settingsService.setHomePage(pageId));
});

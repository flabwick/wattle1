import { Router } from "express";
import * as webSearchService from "../services/webSearchService.js";

// Mounted at /api/search — the "search" CardType's own two modes
// (registries/definitions/searchCardType.ts). Vault mode reuses the existing
// GET /api/cards and GET /api/pages search endpoints directly; this router is only
// for the web mode, which has no other home.
export const searchRouter = Router();

// GET /api/search/web?q=... — Tavily, gated on TAVILY_API_KEY (see webSearchService.ts).
searchRouter.get("/web", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  res.json(await webSearchService.searchWeb(q));
});

// POST /api/search/web/extract  { urls: string[] } — full page text for the "export
// selected results as a Card" action (SearchCardBody.tsx). Up to 20 URLs (Tavily's
// own /extract cap) — trimmed here rather than left for Tavily to reject.
searchRouter.post("/web/extract", async (req, res) => {
  const urls = req.body?.urls;
  if (!Array.isArray(urls) || urls.some((u) => typeof u !== "string")) {
    return res.status(400).json({ error: "urls must be an array of strings" });
  }
  res.json(await webSearchService.extractPages(urls.slice(0, 20)));
});

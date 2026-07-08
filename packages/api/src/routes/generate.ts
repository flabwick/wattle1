import { Router } from "express";
import * as generationService from "../services/generationService.js";

export const generateRouter = Router();

// POST /api/generate  { pageCardId } — the Generation Rule (spec1.md Part 2 + Part 3).
generateRouter.post("/", async (req, res) => {
  const { pageCardId } = req.body ?? {};
  if (typeof pageCardId !== "string") {
    return res.status(400).json({ error: "pageCardId is required" });
  }
  res.status(201).json(await generationService.generateFromCard(pageCardId));
});

// GET /api/generate/context/:pageCardId — preview the context a generation would use,
// without triggering it. Makes context assembly inspectable (spec1.md Part 1 §2).
generateRouter.get("/context/:pageCardId", async (req, res) => {
  res.json(await generationService.assembleContext(req.params.pageCardId));
});

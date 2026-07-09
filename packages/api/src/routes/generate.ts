import { Router } from "express";
import type { GenerateResponse } from "@wattle/shared";
import * as generationService from "../services/generationService.js";
import { runOperation } from "../operations/run.js";

export const generateRouter = Router();

// POST /api/generate  { pageCardId } — the Generation Rule (spec1.md Part 2 + Part 3).
// Wraps the "card.generate" Operation.
generateRouter.post("/", async (req, res) => {
  const result = await runOperation<GenerateResponse>("card.generate", req.body);
  res.status(201).json(result);
});

// GET /api/generate/context/:pageCardId — preview the context a generation would use,
// without triggering it. Makes context assembly inspectable (spec1.md Part 1 §2).
generateRouter.get("/context/:pageCardId", async (req, res) => {
  res.json(await generationService.assembleContext(req.params.pageCardId));
});

// GET /api/generate/stream/:pageCardId — Server-Sent Events preview of a generation.
// Read-only like /context/:pageCardId above: it does not create a PageCard or persist
// anything, it just streams what a generation would produce. Additive — the existing
// non-streaming POST /api/generate is unchanged and still the way to actually generate.
generateRouter.get("/stream/:pageCardId", async (req, res) => {
  const context = await generationService.assembleContext(req.params.pageCardId);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  for await (const chunk of generationService.streamModel(context)) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    if (chunk.done) break;
  }
  res.end();
});

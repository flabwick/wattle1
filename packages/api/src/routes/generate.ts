import type { Response } from "express";
import { Router } from "express";
import type { CardBlockEvent } from "@wattle/prompt-engine";
import type { GenerateResponse } from "@wattle/shared";
import * as generationService from "../services/generationService.js";
import { runOperation } from "../operations/run.js";

export const generateRouter = Router();

// GET /api/generate/context/:pageCardId — preview the context a generation would use,
// without triggering it. Makes context assembly inspectable (spec1.md Part 1 §2).
generateRouter.get("/context/:pageCardId", async (req, res) => {
  res.json(await generationService.assembleContext(req.params.pageCardId));
});

/** Shared by both streaming routes below: forwards CardBlockParser events as SSE until
 *  a "done"/"error" event, or reports a thrown error (bad credentials, network failure
 *  — see the ModelProvider's own fetch calls) the same way. res.writeHead has already
 *  committed the response by the time either route calls this, so a thrown error can't
 *  go through app.ts's normal JSON error middleware (that would throw
 *  ERR_HTTP_HEADERS_SENT) — it's reported as one more SSE event instead. */
async function pipeGenerationEvents(res: Response, events: AsyncGenerator<CardBlockEvent>) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    for await (const event of events) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === "done" || event.type === "error") break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
  }
  res.end();
}

/** The Feed Input Button's optional guided-generation text (Step 6 spec §2.2) — an
 *  EventSource GET can't carry a body, so it rides along as a query param instead. */
function instructionParam(req: { query: Record<string, unknown> }): string | undefined {
  const raw = req.query.instruction;
  return typeof raw === "string" && raw.trim() ? raw : undefined;
}

// GET /api/generate/stream/:pageCardId — the sole model invocation for a generation
// triggered from a selected Card (there is no separate preview call and persist call
// any more). Read-only: it does not create a PageCard or persist anything — the
// frontend holds the result as a local "ghost card" until the user explicitly accepts
// it via POST /api/generate/accept below.
generateRouter.get("/stream/:pageCardId", async (req, res) => {
  await pipeGenerationEvents(
    res,
    generationService.streamGeneration(req.params.pageCardId, instructionParam(req)),
  );
});

// GET /api/generate/stream/page/:pageId — the "nothing selected" counterpart: appends
// at the bottom of the Page instead of directly below a specific Card, using
// everything already on that Page (and every Page above it) as context.
generateRouter.get("/stream/page/:pageId", async (req, res) => {
  await pipeGenerationEvents(
    res,
    generationService.streamGenerationForPage(req.params.pageId, instructionParam(req)),
  );
});

// POST /api/generate/accept  { pageCardId | pageId, title, content, cardType? } —
// persists a ghost card the user reviewed and accepted after one of the streaming
// routes above finished. Wraps the "card.generateAccept" Operation. Does not call the
// model again; the model was already invoked once during streaming.
generateRouter.post("/accept", async (req, res) => {
  const result = await runOperation<GenerateResponse>("card.generateAccept", req.body);
  res.status(201).json(result);
});

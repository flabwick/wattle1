import type { Response } from "express";
import { Router } from "express";
import type { CardBlockEvent } from "@wattle/prompt-engine";
import type { GenerateResponse, PromptCardContextMode } from "@wattle/shared";
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

/** The "promptCard" action job's "on its own" context mode (lib/actionJobs.ts) — same
 *  query-param convention as instructionParam above, for the same
 *  EventSource-can't-carry-a-body reason. */
function standaloneParam(req: { query: Record<string, unknown> }): boolean {
  return req.query.standalone === "1";
}

/** The "prompt" CardType's context-mode selector (cardMetadata.ts's `prompt.context`)
 *  — same query-param convention as the above, defaulting to "none" if missing/invalid
 *  rather than throwing, since a stale/malformed value shouldn't break generation. */
function promptContextModeParam(req: { query: Record<string, unknown> }): PromptCardContextMode {
  const raw = req.query.contextMode;
  return raw === "page" || raw === "tab" || raw === "cards" ? raw : "none";
}

/** Comma-separated Card ids (`prompt.context.cardIds`) — only meaningful alongside
 *  contextMode=cards. */
function contextCardIdsParam(req: { query: Record<string, unknown> }): string[] {
  const raw = req.query.contextCardIds;
  return typeof raw === "string" && raw.trim() ? raw.split(",").filter(Boolean) : [];
}

// GET /api/generate/stream/:pageCardId — the sole model invocation for a generation
// triggered from a selected Card (there is no separate preview call and persist call
// any more). Read-only: it does not create a PageCard or persist anything — the
// frontend holds the result as a local "ghost card" until the user explicitly accepts
// it via POST /api/generate/accept below.
generateRouter.get("/stream/:pageCardId", async (req, res) => {
  await pipeGenerationEvents(
    res,
    generationService.streamGeneration(req.params.pageCardId, instructionParam(req), standaloneParam(req)),
  );
});

// GET /api/generate/stream/page/:pageId — the "nothing selected" counterpart: appends
// at the bottom of the Page instead of directly below a specific Card, using
// everything already on that Page (and every Page above it) as context.
generateRouter.get("/stream/page/:pageId", async (req, res) => {
  await pipeGenerationEvents(res, generationService.streamGenerationForPage(req.params.pageId, instructionParam(req)));
});

// GET /api/generate/stream/stack-member/:memberId — a blank Stack alternate's own
// Feed Input Button (StackBody.tsx); fills that alternate's content in place rather
// than inserting a sibling PageCard.
generateRouter.get("/stream/stack-member/:memberId", async (req, res) => {
  await pipeGenerationEvents(
    res,
    generationService.streamGenerationForStackMember(req.params.memberId, instructionParam(req)),
  );
});

// GET /api/generate/stream/dock-card/:dockCardId — a blank Dock Card's own Feed
// Input Button (Dock.tsx); fills that Dock Card's content in place, same shape as
// the stack-member route above. Always standalone (see generationService.ts's
// GenerationTarget doc comment).
generateRouter.get("/stream/dock-card/:dockCardId", async (req, res) => {
  await pipeGenerationEvents(
    res,
    generationService.streamGenerationForDockCard(req.params.dockCardId, instructionParam(req)),
  );
});

// GET /api/generate/stream/prompt-card/:pageCardId?input=&contextMode=&contextCardIds=
// — the "prompt" CardType's own generation (PromptCardBody.tsx/usePromptGeneration.ts).
// `input` (not `instruction` — always present, never an optional guide alongside other
// context) rides the same query-param convention as every other field here for the same
// EventSource-can't-carry-a-body reason. Read-only, same as the other streaming routes:
// nothing is persisted here — the frontend appends the finished result to
// metadata.prompt.iterations itself once the stream's `done` event lands.
generateRouter.get("/stream/prompt-card/:pageCardId", async (req, res) => {
  const input = typeof req.query.input === "string" ? req.query.input : "";
  await pipeGenerationEvents(
    res,
    generationService.streamPromptCardGeneration(
      req.params.pageCardId,
      input,
      promptContextModeParam(req),
      contextCardIdsParam(req),
    ),
  );
});

// POST /api/generate/accept  { pageCardId | pageId | memberId | dockCardId, title, content, cardType? }
// — persists a ghost card the user reviewed and accepted after one of the streaming
// routes above finished. Does not call the model again; the model was already invoked
// once during streaming. The memberId/dockCardId branches are ad hoc (same reasoning
// as every other Stack action — stackService.ts's routes doc comment), not run
// through the Operation registry the pageCardId/pageId branches wrap
// ("card.generateAccept"), since neither a StackMember nor a DockCard is a Card whose
// type a CardTypeDefinition.supportsOperations gate would even apply to.
generateRouter.post("/accept", async (req, res) => {
  if (req.body?.memberId) {
    const { memberId, title, cardType, parts } = req.body;
    const result = await generationService.persistGeneratedToStackMember(memberId, { title, cardType, parts });
    res.status(201).json(result);
    return;
  }
  if (req.body?.dockCardId) {
    const { dockCardId, title, cardType, parts } = req.body;
    const result = await generationService.persistGeneratedToDockCard(dockCardId, { title, cardType, parts });
    res.status(201).json(result);
    return;
  }
  const result = await runOperation<GenerateResponse>("card.generateAccept", req.body);
  res.status(201).json(result);
});

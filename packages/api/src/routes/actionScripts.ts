import { Router } from "express";
import * as actionScriptService from "../services/actionScriptService.js";

// Mounted at /api/action-scripts — the "generate an action-script with AI"
// feature's sole endpoint. Plain service-backed route, no Operation-registry entry
// (same precedent as annotations.ts) — a structural, one-off model call, not
// behavior gated per-CardType.
export const actionScriptsRouter = Router();

// POST /api/action-scripts/generate  { actionsDoc, instruction, currentScript? } -> { text }
// One blocking model call, no streaming — see actionScriptService.ts's own doc
// comment. `actionsDoc` is the runnable-action vocabulary rendered client-side
// (lib/actionScriptPrompt.ts) from the action-job registry — this route (and this
// whole package) never needs its own copy of what jobs/fields exist. The static
// prose around it lives server-side, in packages/prompt-engine/prompts/action-script/
// system.md.
actionScriptsRouter.post("/generate", async (req, res) => {
  const { actionsDoc, instruction, currentScript } = req.body ?? {};
  if (typeof actionsDoc !== "string" || typeof instruction !== "string") {
    res.status(400).json({ error: "actionsDoc and instruction are both required strings" });
    return;
  }
  const text = await actionScriptService.generateActionScript(
    actionsDoc,
    instruction,
    typeof currentScript === "string" ? currentScript : undefined,
  );
  res.json({ text });
});

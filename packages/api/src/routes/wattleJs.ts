import { Router } from "express";
import * as wattleJsService from "../services/wattleJsService.js";

// Mounted at /api/wattle-js — sandboxed "js" card script generation. Same shape as
// actionScripts.ts's own /generate.
export const wattleJsRouter = Router();

// POST /api/wattle-js/generate  { instruction, currentScript? } -> { text }
wattleJsRouter.post("/generate", async (req, res) => {
  const { instruction, currentScript } = req.body ?? {};
  if (typeof instruction !== "string") {
    res.status(400).json({ error: "instruction is required" });
    return;
  }
  const text = await wattleJsService.generateWattleJs(
    instruction,
    typeof currentScript === "string" ? currentScript : undefined,
  );
  res.json({ text });
});

// POST /api/wattle-js/ai  { prompt, system? } -> { text }
// The sandbox's own headless `wattle.ai(...)` — see wattleJsService.runWattleAi's
// own doc comment for why this is a distinct, silent-by-default endpoint from
// /generate above (no vault context, no fixed system prompt, no card side effects).
wattleJsRouter.post("/ai", async (req, res) => {
  const { prompt, system } = req.body ?? {};
  if (typeof prompt !== "string") {
    res.status(400).json({ error: "prompt is required" });
    return;
  }
  const text = await wattleJsService.runWattleAi(prompt, typeof system === "string" ? system : undefined);
  res.json({ text });
});

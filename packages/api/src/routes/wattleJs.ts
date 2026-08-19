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

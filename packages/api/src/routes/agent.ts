import { Router } from "express";
import type { AgentMessage, ToolDefinition } from "@wattle/shared";
import * as agentService from "../services/agentService.js";

// Mounted at /api/agent — the Brilliantly Simple Generation Agent's sole endpoint.
// Plain service-backed route, no Operation-registry entry (same precedent as
// action-scripts.ts/annotations.ts) — a structural, one-off model call, not
// behavior gated per-CardType. The client (useAgentLoop.ts) owns the actual loop,
// calling this once per round and running whatever tool_use blocks come back
// through the existing action-job runner itself — this route never runs a tool.
export const agentRouter = Router();

// POST /api/agent/turn  { scope, instruction, contextText, messages, tools, maxTokens? }
// -> GenerateWithToolsResult ({ content, stopReason })
agentRouter.post("/turn", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const scope = body.scope === "cards" ? "cards" : "page";
  const instruction = typeof body.instruction === "string" ? body.instruction : "";
  const contextText = typeof body.contextText === "string" ? body.contextText : "";
  const messages = Array.isArray(body.messages) ? (body.messages as AgentMessage[]) : [];
  const tools = Array.isArray(body.tools) ? (body.tools as ToolDefinition[]) : [];
  const maxTokens = typeof body.maxTokens === "number" ? body.maxTokens : undefined;

  const result = await agentService.runAgentTurn({ scope, instruction, contextText, messages, tools, maxTokens });
  res.json(result);
});

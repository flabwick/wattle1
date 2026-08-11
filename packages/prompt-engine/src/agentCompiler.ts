import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROMPTS_DIR } from "./promptsDir.js";

/** Reads the static system prompt fresh off disk on every call — same "no rebuild,
 *  no restart" convention every other loader in this package follows (see
 *  prompts/README.md). Unlike action-script's own compiler, there is no dynamic
 *  splice here: the agent's tool vocabulary travels as a real `tools` array on the
 *  provider request (native tool-calling), not as prose baked into the system
 *  prompt, so this file can stay plain markdown with no placeholder at all. */
function loadSystemPrompt(): string {
  return readFileSync(join(PROMPTS_DIR, "agent/system.md"), "utf-8").trim();
}

export interface CompileAgentTurnInput {
  scope: "page" | "cards";
  instruction: string;
  /** The page/selection context rendered as plain text (built client-side — see
   *  @wattle/web's useAgentLoop.ts — since assembling it needs the same reactive
   *  Card/Page state every other web-only piece of this app already has to hand). */
  contextText: string;
}

export interface CompiledAgentTurn {
  system: string;
  userMessage: string;
}

/**
 * Compiles the very first turn of an agent run (Brilliantly Simple Generation Agent
 * plan) into a {system, userMessage} pair — every turn after that reuses the same
 * `system` string but supplies its own `messages` (the running conversation,
 * including tool_use/tool_result blocks) instead of calling this again; see
 * agentService.ts, the one caller.
 */
export function compileAgentTurn(input: CompileAgentTurnInput): CompiledAgentTurn {
  const scopeLine =
    input.scope === "cards"
      ? "Scope for this turn: cards — only mutate the card ids listed as in scope below (and their embeds, if any). Leave every other card on the page untouched."
      : "Scope for this turn: page — you may create, edit, delete, reorder, or turn into a stack any card on the current page.";
  const userMessage = [scopeLine, "", `Instruction: ${input.instruction}`, "", input.contextText]
    .join("\n")
    .trim();
  return { system: loadSystemPrompt(), userMessage };
}

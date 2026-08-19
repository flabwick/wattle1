import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROMPTS_DIR } from "./promptsDir.js";

/**
 * Compiles a "js" CardType script generation request into a {systemPrompt,
 * userMessage} pair for a ModelProvider — the flip-face "Describe what this
 * card should do" (@wattle/web's lib/wattleJsJob.ts, the one caller) and the
 * agent's own `setJsCard` tool both funnel through this same prompt. Unlike
 * compileActionScriptPrompt/compileFormScriptPrompt, there is no dynamic
 * "actionsDoc" splice here — the whole point of the `wattle` SDK (the plan's
 * own words) is that it's deliberately smaller than the ~30-job action
 * registry, so the static prompt on disk (prompts/wattle-js/system.md) is the
 * complete system prompt as-is, never assembled from a registry that could
 * drift. Adding a new `wattle.*` method means updating that file by hand (see
 * docs/adding-features.md) — not something this compiler can auto-generate.
 */
export interface CompileWattleJsInput {
  instruction: string;
  /** The card's own current script, included so the model edits in context
   *  instead of starting from nothing every time. Omit for a brand-new card. */
  currentScript?: string;
}

export interface CompiledWattleJsPrompt {
  systemPrompt: string;
  userMessage: string;
}

function loadSystemPrompt(): string {
  return readFileSync(join(PROMPTS_DIR, "wattle-js/system.md"), "utf-8").trim();
}

function renderUserMessage(instruction: string, currentScript?: string): string {
  if (!currentScript || currentScript.trim() === "") {
    return instruction;
  }
  return `Current script:\n${currentScript}\n\nInstruction: ${instruction}\n\nWrite the complete new script (this replaces the current one — it is shown for context, not something to append to).`;
}

export function compileWattleJsPrompt(input: CompileWattleJsInput): CompiledWattleJsPrompt {
  return {
    systemPrompt: loadSystemPrompt(),
    userMessage: renderUserMessage(input.instruction, input.currentScript),
  };
}

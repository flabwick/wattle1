import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROMPTS_DIR } from "./promptsDir.js";

export interface CompileActionScriptInput {
  /** The runnable-action vocabulary, pre-rendered as plain text — one entry per
   *  registered job (id, label, its own fields). Built client-side
   *  (@wattle/web's lib/actionScriptPrompt.ts, from lib/actionJobRegistry.ts) and
   *  passed in rather than generated here, because the job registry itself is a
   *  browser-only module (its jobs call `window.open`, the fetch-based API client,
   *  the reactive cardStore cache — none of which exist server-side). This is the
   *  ONE part of the action-script system prompt that isn't plain static markdown —
   *  see prompts/action-script/system.md's own `<!-- ACTIONS -->` placeholder,
   *  which this compiler substitutes it into. */
  actionsDoc: string;
  instruction: string;
  /** The button's own current script, serialized back to text
   *  (@wattle/web's lib/actionScript.ts's serializeActionScript) — when
   *  regenerating an existing button, included so the model edits in context
   *  instead of starting from nothing every time. Omit for a brand-new button. */
  currentScript?: string;
}

export interface CompiledActionScriptPrompt {
  systemPrompt: string;
  userMessage: string;
}

const ACTIONS_PLACEHOLDER = "<!-- ACTIONS -->";

/** Reads the static prose fresh off disk on every call, then splices in the one
 *  dynamic section — same "no rebuild, no restart" convention every other loader
 *  in this package follows, see prompts/README.md. */
function loadSystemPrompt(actionsDoc: string): string {
  const template = readFileSync(join(PROMPTS_DIR, "action-script/system.md"), "utf-8").trim();
  if (!template.includes(ACTIONS_PLACEHOLDER)) {
    throw new Error(`prompts/action-script/system.md is missing its ${ACTIONS_PLACEHOLDER} placeholder`);
  }
  return template.replace(ACTIONS_PLACEHOLDER, actionsDoc);
}

/** Renders the per-request half — the instruction, plus the current script when
 *  regenerating (see CompileActionScriptInput.currentScript's own doc comment). */
function renderUserMessage(instruction: string, currentScript?: string): string {
  if (!currentScript || currentScript.trim() === "") {
    return instruction;
  }
  return `Current script:\n${currentScript}\n\nInstruction: ${instruction}\n\nWrite the complete new script (this replaces the current one — it is shown for context, not something to append to).`;
}

/**
 * Compiles an action-script generation request into a {systemPrompt, userMessage}
 * pair for a ModelProvider — the "action" CardType's own "Generate steps with AI"
 * feature (see @wattle/web's lib/actionScriptJob.ts, and
 * packages/api/src/services/actionScriptService.ts, the one caller). The static
 * prose lives in prompts/action-script/system.md, editable like every other prompt
 * in this package; the runnable-action vocabulary is supplied by the caller (see
 * CompileActionScriptInput.actionsDoc) since it lives in a browser-only registry
 * this package can't import.
 */
export function compileActionScriptPrompt(input: CompileActionScriptInput): CompiledActionScriptPrompt {
  return {
    systemPrompt: loadSystemPrompt(input.actionsDoc),
    userMessage: renderUserMessage(input.instruction, input.currentScript),
  };
}

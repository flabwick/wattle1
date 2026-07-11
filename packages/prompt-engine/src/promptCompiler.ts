import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// This file lives in <package root>/src, prompts/ is a sibling of src/ — one level up
// from wherever this module actually runs from (src/ in dev via tsx, dist/ if ever run
// compiled), so the relative offset holds either way.
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPTS_DIR = join(PACKAGE_ROOT, "prompts");

/**
 * One piece of assembled context above a triggering Card — structurally the same shape
 * as @wattle/shared's GenerationContextEntry, duplicated here so this package doesn't
 * need to depend on @wattle/shared for one field list (see the old templates/index.ts).
 */
export interface ContextEntry {
  title: string;
  content: string;
}

/** The trigger modes a generation can be compiled for — one prompts/<mode>/ subfolder
 *  each (see prompts/README.md). Only "generate" is wired to an actual caller today;
 *  "selection" and "interactive" are addressable by name so their triggering UI can be
 *  wired in later without restructuring this compiler. */
export type PromptMode = "generate" | "selection" | "interactive";

export interface GenerateModeInput {
  mode: "generate";
  context: ContextEntry[];
}

export interface SelectionModeInput {
  mode: "selection";
  context: ContextEntry[];
  /** The highlighted/selected text this sub-prompt is scoped to. */
  selectedText: string;
}

export interface InteractiveModeInput {
  mode: "interactive";
  context: ContextEntry[];
  /** The triggering Card's own content, which supplies the override instruction. */
  overridePrompt: string;
}

export type CompilePromptInput = GenerateModeInput | SelectionModeInput | InteractiveModeInput;

export interface CompiledPrompt {
  systemPrompt: string;
  userMessage: string;
}

const SYSTEM_PROMPT_FILE: Record<PromptMode, string> = {
  generate: "generate/system.md",
  selection: "selection/system.md",
  interactive: "interactive/system.md",
};

/** Reads a prompt file fresh off disk on every call — no caching, nothing baked into
 *  compiled code — so editing a .md file changes model behavior on the next generation
 *  with no rebuild or restart. */
function loadSystemPrompt(mode: PromptMode): string {
  return readFileSync(join(PROMPTS_DIR, SYSTEM_PROMPT_FILE[mode]), "utf-8").trim();
}

/** Renders assembled context into the literal user-message text. Unchanged from the old
 *  "generate-from-context" template: each entry as "- title\ncontent", blank-line
 *  separated, or a placeholder when there's nothing above the trigger. */
function renderContext(context: ContextEntry[]): string {
  if (context.length === 0) return "(no context above)";
  return context.map((c) => `- ${c.title}\n${c.content}`).join("\n\n");
}

/**
 * Compiles a trigger into a {systemPrompt, userMessage} pair for a ModelProvider,
 * replacing the old flat "dump context as bullet points" template. The system prompt is
 * loaded fresh from prompts/<mode>/system.md; the user message is the assembled
 * context — in the existing directional "everything above, nothing below" form, which
 * does not change here — plus, for the selection/interactive modes, the extra input
 * that mode needs.
 */
export function compilePrompt(input: CompilePromptInput): CompiledPrompt {
  const systemPrompt = loadSystemPrompt(input.mode);
  const contextText = renderContext(input.context);

  switch (input.mode) {
    case "generate":
      return { systemPrompt, userMessage: contextText };
    case "selection":
      return {
        systemPrompt,
        userMessage: `${contextText}\n\n---\nSelected text:\n${input.selectedText}`,
      };
    case "interactive":
      return {
        systemPrompt,
        userMessage: `${contextText}\n\n---\nOverride instruction:\n${input.overridePrompt}`,
      };
  }
}

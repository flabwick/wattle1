import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROMPTS_DIR } from "./promptsDir.js";

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
  /** An optional free-text instruction from the quick-lookup popup's own textbox
   *  (QuickLookupMenu.tsx) — when omitted or blank, the model defaults to a plain,
   *  short clarification of the selected text (see prompts/selection/system.md). */
  instruction?: string;
}

export interface InteractiveModeInput {
  mode: "interactive";
  context: ContextEntry[];
  /** The triggering Card's own content, which supplies the override instruction. */
  overridePrompt: string;
  /** The runnable-action vocabulary, pre-rendered as plain text — same shape and same
   *  reason as actionScriptCompiler.ts's CompileActionScriptInput.actionsDoc (built
   *  client-side, @wattle/web's lib/actionScriptPrompt.ts, since the job registry it
   *  reads is a browser-only module). Spliced into interactive/system.md's own
   *  `<!-- ACTIONS -->` placeholder, teaching this mode's model how to write a
   *  type="action" card's own content — see that prompt's "Action cards" section.
   *  Omitted (or blank) leaves the placeholder spliced with nothing, which is only
   *  ever expected for callers that predate the self-driving generation pipeline. */
  actionsDoc?: string;
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

const ACTIONS_PLACEHOLDER = "<!-- ACTIONS -->";

/** Reads a prompt file fresh off disk on every call — no caching, nothing baked into
 *  compiled code — so editing a .md file changes model behavior on the next generation
 *  with no rebuild or restart. Only "interactive" has a dynamic section to splice in
 *  (see InteractiveModeInput.actionsDoc's own doc comment) — same
 *  read-then-substitute-one-placeholder pattern actionScriptCompiler.ts's own
 *  loadSystemPrompt uses for prompts/action-script/system.md. */
function loadSystemPrompt(mode: PromptMode, actionsDoc?: string): string {
  const template = readFileSync(join(PROMPTS_DIR, SYSTEM_PROMPT_FILE[mode]), "utf-8").trim();
  if (mode !== "interactive") return template;
  if (!template.includes(ACTIONS_PLACEHOLDER)) {
    throw new Error(`prompts/interactive/system.md is missing its ${ACTIONS_PLACEHOLDER} placeholder`);
  }
  return template.replace(ACTIONS_PLACEHOLDER, actionsDoc ?? "");
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
  const systemPrompt = loadSystemPrompt(input.mode, input.mode === "interactive" ? input.actionsDoc : undefined);
  const contextText = renderContext(input.context);

  switch (input.mode) {
    case "generate":
      return { systemPrompt, userMessage: contextText };
    case "selection": {
      const instruction = input.instruction?.trim();
      return {
        systemPrompt,
        userMessage: `${contextText}\n\n---\nSelected text:\n${input.selectedText}${
          instruction ? `\n\n---\nUser instruction:\n${instruction}` : ""
        }`,
      };
    }
    case "interactive":
      return {
        systemPrompt,
        userMessage: `${contextText}\n\n---\nOverride instruction:\n${input.overridePrompt}`,
      };
  }
}

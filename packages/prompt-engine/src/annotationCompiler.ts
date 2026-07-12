import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Same PACKAGE_ROOT/PROMPTS_DIR reasoning as promptCompiler.ts — this file lives in
// <package root>/src, prompts/ is a sibling of src/.
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPTS_DIR = join(PACKAGE_ROOT, "prompts");

/** The three annotation processes (prompts/README.md's "Annotation processes" table)
 *  — a separate, parallel system from promptCompiler.ts's PromptMode: these never
 *  re-emit or rewrite Card content, only sparse anchor-based entries. */
export type AnnotationProcess = "diff" | "footnote" | "highlight";

/** One Card in an annotation run's scope — the whole target Card and its nested Cards
 *  for a whole-card run, or a single synthetic entry (id + selected text) for a
 *  selection-scoped run. Structurally duplicated from @wattle/shared's Card fields for
 *  the same reason ContextEntry is in promptCompiler.ts: this package stays
 *  independent of @wattle/shared. */
export interface AnnotationTargetCard {
  cardId: string;
  title: string;
  content: string;
}

export interface CompileAnnotationInput {
  process: AnnotationProcess;
  cards: AnnotationTargetCard[];
}

export interface CompiledAnnotationPrompt {
  systemPrompt: string;
  userMessage: string;
}

const SYSTEM_PROMPT_FILE: Record<AnnotationProcess, string> = {
  diff: "diff/system.md",
  footnote: "footnote/system.md",
  highlight: "highlight/system.md",
};

/** Reads a prompt file fresh off disk on every call, same convention as
 *  promptCompiler.ts's loadSystemPrompt — editing a .md file changes model behavior
 *  on the next run with no rebuild or restart. */
function loadSystemPrompt(process: AnnotationProcess): string {
  return readFileSync(join(PROMPTS_DIR, SYSTEM_PROMPT_FILE[process]), "utf-8").trim();
}

/** Renders the scope as one labeled block per Card, matching the `[cardId: <id>]
 *  <title>\n<content>` shape every prompts/{diff,footnote,highlight}/system.md
 *  documents as its input — this is what lets the model tag which Card each entry's
 *  `cardId` belongs to. */
function renderCards(cards: AnnotationTargetCard[]): string {
  return cards.map((c) => `[cardId: ${c.cardId}] ${c.title}\n${c.content}`).join("\n\n");
}

/**
 * Compiles an annotation process invocation into a {systemPrompt, userMessage} pair
 * for a ModelProvider. The system prompt is loaded fresh from
 * prompts/<process>/system.md; the user message is every Card in scope, labeled by id
 * so the model's response entries can be attributed back to the right Card.
 */
export function compileAnnotationPrompt(input: CompileAnnotationInput): CompiledAnnotationPrompt {
  return {
    systemPrompt: loadSystemPrompt(input.process),
    userMessage: renderCards(input.cards),
  };
}

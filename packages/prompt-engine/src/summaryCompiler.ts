import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Same PACKAGE_ROOT/PROMPTS_DIR reasoning as promptCompiler.ts/annotationCompiler.ts —
// this file lives in <package root>/src, prompts/ is a sibling of src/.
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPTS_DIR = join(PACKAGE_ROOT, "prompts");

export interface CompiledSummaryPrompt {
  systemPrompt: string;
  userMessage: string;
}

/**
 * Compiles a Card's plain-text content into a {systemPrompt, userMessage} pair for a
 * ModelProvider — the Nearby system's per-Card summary maintenance
 * (summaryService.ts), a separate small system from promptCompiler.ts's PromptMode and
 * annotationCompiler.ts's AnnotationProcess: this never produces structured output,
 * just one or two plain sentences.
 */
export function compileSummaryPrompt(plainTextContent: string): CompiledSummaryPrompt {
  const systemPrompt = readFileSync(join(PROMPTS_DIR, "summary/system.md"), "utf-8").trim();
  return {
    systemPrompt,
    userMessage: plainTextContent.trim() === "" ? "(empty)" : plainTextContent,
  };
}

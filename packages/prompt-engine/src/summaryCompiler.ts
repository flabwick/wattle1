import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROMPTS_DIR } from "./promptsDir.js";

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

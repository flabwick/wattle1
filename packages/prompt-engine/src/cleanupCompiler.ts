import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROMPTS_DIR } from "./promptsDir.js";

export interface CompiledCleanupPrompt {
  systemPrompt: string;
  userMessage: string;
}

/**
 * Compiles the {systemPrompt, userMessage} pair for the "AI Cleanup" extraction
 * method (Dock.tsx's Convert menu, packages/api/src/services/fileExtractionService.ts)
 * — takes the raw text a text-layer/OCR extraction pass already produced and asks a
 * plain text-generation model to reformat it (fix OCR artifacts, restore paragraph
 * breaks, strip page-boundary markers) without summarizing or translating. A
 * separate, small system from extractionCompiler.ts: that one sends an *image* to a
 * vision model, this one sends *already-extracted text* to whichever text model is
 * currently active (activeProviderId()) — no vision capability needed here.
 */
export function compileCleanupPrompt(rawText: string): CompiledCleanupPrompt {
  const systemPrompt = readFileSync(join(PROMPTS_DIR, "cleanup/system.md"), "utf-8").trim();
  return { systemPrompt, userMessage: rawText };
}

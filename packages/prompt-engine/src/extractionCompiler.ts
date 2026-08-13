import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROMPTS_DIR } from "./promptsDir.js";

export interface CompiledExtractionPrompt {
  systemPrompt: string;
  userText: string;
}

const BASE_USER_TEXT = "Transcribe this page.";

/**
 * Compiles the {systemPrompt, userText} pair for one text-extraction/OCR vision call
 * (`providers/openRouterVision.ts`) — the "file" CardType's own extract/OCR buttons
 * (`fileExtractionService.ts`). A separate, small system from summaryCompiler.ts:
 * this sends an image, not plain-text content, and the optional `instructions` a user
 * types (FileView.tsx) is spliced into the user message rather than the system
 * prompt, so it reads as a request alongside the image rather than a rule that
 * silently overrides the verbatim-transcription contract in system.md.
 */
export function compileExtractionPrompt(instructions?: string): CompiledExtractionPrompt {
  const systemPrompt = readFileSync(join(PROMPTS_DIR, "extract/system.md"), "utf-8").trim();
  const userText = instructions?.trim()
    ? `${BASE_USER_TEXT}\n\nAdditional instructions from the user: ${instructions.trim()}`
    : BASE_USER_TEXT;
  return { systemPrompt, userText };
}

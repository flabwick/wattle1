import type { ModelDefinition } from "../modelRegistry.js";

/** The default vision-capable model for text extraction/OCR (fileExtractionService.ts)
 *  — cheap and strong at document transcription. Overridable via
 *  config/model.config.json's "visionModel" field or the VISION_MODEL_ID env var,
 *  same precedence as generation's own MODEL_ID (see openRouterProvider.ts's
 *  resolveOpenRouterModel). */
export const geminiFlash: ModelDefinition = {
  id: "gemini-flash",
  openRouterModel: "google/gemini-2.5-flash",
  label: "Gemini 2.5 Flash",
};

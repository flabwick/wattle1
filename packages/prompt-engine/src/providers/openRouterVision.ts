import { getCredential } from "../credentials/index.js";
import { resolveOpenRouterModel } from "./openRouterProvider.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 90_000;

export interface VisionImageInput {
  mimeType: string;
  /** Raw base64, no "data:" prefix — this module adds it. */
  base64: string;
}

export interface VisionExtractRequest {
  image: VisionImageInput;
  systemPrompt: string;
  userText: string;
  /** A ModelRegistry id or a raw OpenRouter slug — resolved via
   *  resolveOpenRouterModel, same as every other OpenRouter call in this package. */
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface VisionExtractResult {
  text: string;
  /** The raw OpenRouter slug actually used, for caching alongside the result
   *  (cardMetadata.ts's `file.extraction.model`). */
  model: string;
}

/** Only the fields read from a non-streaming chat/completions response — same shape
 *  openRouterProvider.ts's own OpenRouterCompletionResponse reads, duplicated here
 *  rather than shared since the two request shapes (tool-calling vs. one image) have
 *  nothing else in common. */
interface OpenRouterVisionResponse {
  choices?: { message?: { content?: string | null } }[];
}

/**
 * One-shot, non-streaming OpenAI-compatible multimodal chat/completions call to
 * OpenRouter — the "file" CardType's text-extraction/OCR path
 * (fileExtractionService.ts). Deliberately separate from openRouterProvider.ts's
 * ModelProvider implementation: that machinery translates Anthropic-shaped
 * AgentMessages for tool-calling (see toOpenAIMessages there), which has nothing to
 * do with a single image-in/text-out round trip — retrofitting it to also carry an
 * `image` content-block variant would touch the shared MessageContent union and both
 * provider implementations for a need this narrower function meets on its own.
 */
export async function extractTextFromImage(req: VisionExtractRequest): Promise<VisionExtractResult> {
  const apiKey = getCredential("OPENROUTER_API_KEY");
  const model = resolveOpenRouterModel(req.model);

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [
        { role: "system", content: req.systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: req.userText },
            { type: "image_url", image_url: { url: `data:${req.image.mimeType};base64,${req.image.base64}` } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText} ${body}`);
  }

  const data = (await response.json()) as OpenRouterVisionResponse;
  return { text: data.choices?.[0]?.message?.content ?? "", model };
}

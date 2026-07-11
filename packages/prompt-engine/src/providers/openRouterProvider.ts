import type { ModelProvider } from "@wattle/shared";
import { getCredential } from "../credentials/index.js";
import { modelRegistry } from "../models/modelRegistry.js";
import { initModels } from "../models/init.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL_ID = "claude-sonnet";

/** OpenRouter's OpenAI-compatible streaming chunk shape (only the fields we read). */
interface OpenRouterStreamChunk {
  choices?: { delta?: { content?: string } }[];
}

/**
 * Resolves opts.model (from config/model.config.json, falling back to env MODEL_ID,
 * then DEFAULT_MODEL_ID) to the raw "vendor/model" string OpenRouter expects. Accepts
 * either a ModelRegistry id (e.g. "claude-sonnet") or, if that lookup misses, the id is
 * used verbatim as an OpenRouter model slug (e.g. "deepseek/deepseek-chat") — the
 * config file is meant to be editable to any OpenRouter-supported model without also
 * requiring a matching models/definitions/*.ts entry.
 */
function resolveModel(overrideId?: string): string {
  initModels();
  const id = overrideId ?? process.env.MODEL_ID ?? DEFAULT_MODEL_ID;
  return modelRegistry.list().find((m) => m.id === id)?.openRouterModel ?? id;
}

export const openRouterProvider: ModelProvider = {
  id: "openrouter",
  async *generate(prompt, opts) {
    const apiKey = getCredential("OPENROUTER_API_KEY");
    const model = resolveModel(opts?.model as string | undefined);
    const systemPrompt = opts?.systemPrompt as string | undefined;

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: opts?.temperature,
        max_tokens: opts?.maxTokens,
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `OpenRouter request failed: ${response.status} ${response.statusText} ${body}`,
      );
    }

    // OpenRouter streams OpenAI-compatible SSE: "data: <json>\n\n" per delta, terminated
    // by a literal "data: [DONE]" — mapped here to the existing { text, done } Chunk
    // shape so routes/generate.ts's stream route doesn't need to change (see G2 for a
    // typed StreamEvent pipeline).
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice("data:".length).trim();
          if (data === "[DONE]") {
            yield { text: "", done: true };
            return;
          }
          const parsed = JSON.parse(data) as OpenRouterStreamChunk;
          const text = parsed.choices?.[0]?.delta?.content ?? "";
          if (text) yield { text, done: false };
        }
      }
    }
    yield { text: "", done: true };
  },
};

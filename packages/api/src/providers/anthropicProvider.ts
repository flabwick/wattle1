import Anthropic from "@anthropic-ai/sdk";
import type { ModelProvider } from "@wattle/shared";
import { getCredential } from "@wattle/prompt-engine";

const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS = 4096;

export const anthropicProvider: ModelProvider = {
  id: "anthropic",
  async *generate(prompt, opts) {
    const apiKey = getCredential("ANTHROPIC_API_KEY");
    const client = new Anthropic({ apiKey });

    const stream = client.messages.stream({
      model: (opts?.model as string | undefined) ?? DEFAULT_MODEL,
      max_tokens: (opts?.maxTokens as number | undefined) ?? DEFAULT_MAX_TOKENS,
      temperature: opts?.temperature as number | undefined,
      system: opts?.systemPrompt as string | undefined,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { text: event.delta.text, done: false };
      }
    }
    yield { text: "", done: true };
  },
};

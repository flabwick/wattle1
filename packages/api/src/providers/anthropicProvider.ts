import Anthropic from "@anthropic-ai/sdk";
import type { ModelProvider } from "@wattle/shared";
import { getCredential } from "@wattle/prompt-engine";

const MODEL = "claude-opus-4-8";

export const anthropicProvider: ModelProvider = {
  id: "anthropic",
  async *generate(prompt) {
    const apiKey = getCredential("ANTHROPIC_API_KEY");
    const client = new Anthropic({ apiKey });

    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
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

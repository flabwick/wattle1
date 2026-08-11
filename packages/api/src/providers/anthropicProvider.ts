import Anthropic from "@anthropic-ai/sdk";
import type { GenerateWithToolsRequest, GenerateWithToolsResult, MessageContent, ModelProvider } from "@wattle/shared";
import { getCredential } from "@wattle/prompt-engine";

const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS = 4096;

/** Anthropic's own `stop_reason` has a couple of values (`stop_sequence`,
 *  `pause_turn`, `refusal`) our smaller enum doesn't distinguish — none of those are
 *  ones the agent loop (Phase 4) needs to react to differently from a generic
 *  "other", so they collapse here rather than growing GenerateWithToolsResult's own
 *  type to match every provider's exact vocabulary. */
function mapStopReason(stopReason: string | null): GenerateWithToolsResult["stopReason"] {
  if (stopReason === "tool_use") return "tool_use";
  if (stopReason === "end_turn") return "end_turn";
  if (stopReason === "max_tokens") return "max_tokens";
  return "other";
}

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
  // One plain (non-streaming) request/response round trip — the agent loop (Phase 4)
  // owns repeating this, not this provider. `messages`/`tools` already carry the same
  // shape Anthropic's own Messages API expects (MessageContent's tool_use/tool_result
  // variants mirror ToolUseBlockParam/ToolResultBlockParam field-for-field) so this is
  // mostly a straight pass-through, not a real translation.
  async generateWithTools(req: GenerateWithToolsRequest): Promise<GenerateWithToolsResult> {
    const apiKey = getCredential("ANTHROPIC_API_KEY");
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: req.model ?? DEFAULT_MODEL,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: req.system,
      tools: req.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
      })),
      messages: req.messages as unknown as Anthropic.MessageParam[],
    });

    const content: MessageContent[] = response.content.map((block): MessageContent => {
      if (block.type === "text") return { type: "text", text: block.text };
      if (block.type === "tool_use") {
        return { type: "tool_use", id: block.id, name: block.name, input: block.input as Record<string, unknown> };
      }
      // Only reachable for block types this request never asks for (e.g. thinking) —
      // collapsed to empty text rather than throwing on an unexpected shape.
      return { type: "text", text: "" };
    });

    return { content, stopReason: mapStopReason(response.stop_reason) };
  },
};

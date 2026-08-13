import type {
  AgentMessage,
  GenerateWithToolsRequest,
  GenerateWithToolsResult,
  MessageContent,
  ModelProvider,
} from "@wattle/shared";
import { getCredential } from "../credentials/index.js";
import { modelRegistry } from "../models/modelRegistry.js";
import { initModels } from "../models/init.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL_ID = "claude-sonnet";

/** OpenRouter's OpenAI-compatible streaming chunk shape (only the fields we read). */
interface OpenRouterStreamChunk {
  choices?: { delta?: { content?: string } }[];
}

/** OpenAI-style tool call, as both sent (echoing a prior assistant turn back) and
 *  received (`arguments` is a JSON *string*, not a parsed object — OpenAI's own
 *  format, unlike Anthropic's ToolUseBlock which uses a real object). */
interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

/** Only the fields read from a non-streaming chat/completions response. */
interface OpenRouterCompletionResponse {
  choices?: {
    message?: { content?: string | null; tool_calls?: OpenAIToolCall[] };
    finish_reason?: string;
  }[];
}

/** AgentMessage/MessageContent (packages/shared) mirror Anthropic's own content-block
 *  shape; OpenAI's tool-calling format is structurally different enough (tool_calls
 *  live on the assistant *message*, not as content blocks; each tool result is its
 *  own "tool"-role message, not a block inside one user turn) that this is a real
 *  translation, not a pass-through the way the Anthropic provider's own
 *  generateWithTools gets away with. */
function toOpenAIMessages(messages: AgentMessage[]): OpenAIChatMessage[] {
  const out: OpenAIChatMessage[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const toolResults = m.content.filter(
      (b): b is Extract<MessageContent, { type: "tool_result" }> => b.type === "tool_result",
    );
    if (toolResults.length > 0) {
      // The agent loop's own convention (mirroring Anthropic): a user-role message
      // carrying tool results holds only tool_result blocks — never mixed with text
      // or tool_use — so there's nothing else in `m.content` to also handle here.
      for (const r of toolResults) {
        out.push({ role: "tool", tool_call_id: r.tool_use_id, content: r.content });
      }
      continue;
    }
    const text = m.content
      .filter((b): b is Extract<MessageContent, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const toolUses = m.content.filter(
      (b): b is Extract<MessageContent, { type: "tool_use" }> => b.type === "tool_use",
    );
    out.push({
      role: m.role,
      content: text || null,
      ...(toolUses.length > 0
        ? {
            tool_calls: toolUses.map((t) => ({
              id: t.id,
              type: "function" as const,
              function: { name: t.name, arguments: JSON.stringify(t.input) },
            })),
          }
        : {}),
    });
  }
  return out;
}

/**
 * Resolves opts.model (from config/model.config.json, falling back to env MODEL_ID,
 * then DEFAULT_MODEL_ID) to the raw "vendor/model" string OpenRouter expects. Accepts
 * either a ModelRegistry id (e.g. "claude-sonnet") or, if that lookup misses, the id is
 * used verbatim as an OpenRouter model slug (e.g. "deepseek/deepseek-chat") — the
 * config file is meant to be editable to any OpenRouter-supported model without also
 * requiring a matching models/definitions/*.ts entry.
 *
 * Exported (as resolveOpenRouterModel) so providers/openRouterVision.ts's one-shot
 * vision call reuses this same lookup instead of duplicating it — that module has its
 * own default (a vision-capable model) rather than DEFAULT_MODEL_ID above, which is
 * why it's still a parameter here rather than baked in.
 */
export function resolveOpenRouterModel(overrideId?: string): string {
  initModels();
  const id = overrideId ?? process.env.MODEL_ID ?? DEFAULT_MODEL_ID;
  return modelRegistry.list().find((m) => m.id === id)?.openRouterModel ?? id;
}
const resolveModel = resolveOpenRouterModel;

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
  // One plain (non-streaming) request/response round trip — the agent loop (Phase 4)
  // owns repeating this, not this provider.
  async generateWithTools(req: GenerateWithToolsRequest): Promise<GenerateWithToolsResult> {
    const apiKey = getCredential("OPENROUTER_API_KEY");
    const model = resolveModel(req.model);

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens,
        messages: [{ role: "system", content: req.system }, ...toOpenAIMessages(req.messages)],
        tools: req.tools.map((tool) => ({
          type: "function",
          function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
        })),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText} ${body}`);
    }

    const data = (await response.json()) as OpenRouterCompletionResponse;
    const choice = data.choices?.[0];
    const content: MessageContent[] = [];
    if (choice?.message?.content) {
      content.push({ type: "text", text: choice.message.content });
    }
    for (const call of choice?.message?.tool_calls ?? []) {
      let input: Record<string, unknown> = {};
      try {
        input = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        // A model that returns malformed JSON arguments shouldn't crash the whole
        // turn — the agent loop's own tool runner will report back a normal
        // tool_result error for this call instead, same as any other bad input.
      }
      content.push({ type: "tool_use", id: call.id, name: call.function.name, input });
    }

    const stopReason: GenerateWithToolsResult["stopReason"] =
      choice?.finish_reason === "tool_calls"
        ? "tool_use"
        : choice?.finish_reason === "stop"
          ? "end_turn"
          : choice?.finish_reason === "length"
            ? "max_tokens"
            : "other";

    return { content, stopReason };
  },
};

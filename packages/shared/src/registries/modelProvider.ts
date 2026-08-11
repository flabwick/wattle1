/** One piece of a model's streamed response. `done: true` marks the final chunk. */
export interface Chunk {
  text: string;
  done: boolean;
}

/** One tool a `generateWithTools` call may offer the model — name + JSON Schema
 *  input shape, same idea as Anthropic's/OpenAI's own tool-calling formats (the
 *  providers below translate this into whichever shape their SDK/HTTP API wants). */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: object;
}

/** One block of a message's content — a plain text reply, the model asking to run a
 *  tool, or (only ever sent back *to* the model, never returned by it) the result of
 *  a tool that already ran. Mirrors Anthropic's own content-block union, since that's
 *  the richest of the two provider formats being adapted to it; OpenRouter's
 *  OpenAI-style tool_calls/tool messages get mapped to/from this shape instead of
 *  introducing a second parallel type. */
export type MessageContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

/** One turn of the agent conversation — `content` is a plain string for a simple
 *  user instruction, or a `MessageContent[]` once tool_use/tool_result blocks are
 *  in play (an assistant turn that called tools, or the user-role turn carrying
 *  those tools' results back). */
export interface AgentMessage {
  role: "user" | "assistant";
  content: string | MessageContent[];
}

export interface GenerateWithToolsRequest {
  system: string;
  messages: AgentMessage[];
  tools: ToolDefinition[];
  maxTokens?: number;
  model?: string;
}

export interface GenerateWithToolsResult {
  /** Text and/or tool_use blocks — never tool_result (that only ever flows the other
   *  direction, in a request's own `messages`). */
  content: MessageContent[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "other";
}

/**
 * A source of model generations, independent of any particular HTTP route. Registering
 * a ModelProvider is how new providers (or a stub for local dev) get added without
 * editing the code that already calls into one.
 */
export interface ModelProvider {
  /** Unique key, e.g. "anthropic", "stub". */
  id: string;
  generate(prompt: string, opts?: Record<string, unknown>): AsyncIterable<Chunk>;
  /** One non-streaming agent turn — a single model call, native provider tool-calling.
   *  Does not run any tools itself (the caller does, via the existing action job
   *  runner) — this only ever returns what the model said/asked for. */
  generateWithTools(req: GenerateWithToolsRequest): Promise<GenerateWithToolsResult>;
}

export class ModelProviderRegistry {
  private readonly providers = new Map<string, ModelProvider>();

  register(provider: ModelProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`ModelProvider "${provider.id}" is already registered`);
    }
    this.providers.set(provider.id, provider);
  }

  get(id: string): ModelProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`ModelProvider "${id}" is not registered`);
    }
    return provider;
  }

  list(): ModelProvider[] {
    return [...this.providers.values()];
  }
}

export const modelProviderRegistry = new ModelProviderRegistry();

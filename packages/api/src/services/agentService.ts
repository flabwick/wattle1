import type { AgentMessage, GenerateWithToolsResult, ToolDefinition } from "@wattle/shared";
import { modelProviderRegistry } from "@wattle/shared";
import { compileAgentTurn } from "@wattle/prompt-engine";
import { activeProviderId } from "../providers/init.js";
import { configuredProviderSettings } from "../modelConfig.js";

export interface AgentTurnRequest {
  scope: "page" | "cards";
  /** Only used to build the first user message — ignored once `messages` is
   *  non-empty (a later round in the same run already has its own history). */
  instruction: string;
  contextText: string;
  messages: AgentMessage[];
  tools: ToolDefinition[];
  maxTokens?: number;
}

/**
 * One turn of the agent loop (Brilliantly Simple Generation Agent plan) — a single,
 * non-streaming model call through whichever ModelProvider is active, native
 * tool-calling. Does not run any tools itself and does not loop: the client
 * (`@wattle/web`'s `useAgentLoop.ts`) owns repeating this until the model stops
 * asking for tools, same "server stays dumb" reasoning `tools` being sent in the
 * request body (not built here from a registry this package can't import) already
 * follows. `messages` empty means this is round 1 of a run — the system prompt +
 * first user message are compiled from `scope`/`instruction`/`contextText`
 * (`agentCompiler.ts`, static markdown, disk-editable); a later round already
 * carries its own full history forward and only `messages` matters (`scope`/
 * `instruction`/`contextText` are ignored then, same as they'd be redundant to
 * resend).
 */
export async function runAgentTurn(req: AgentTurnRequest): Promise<GenerateWithToolsResult> {
  const providerId = activeProviderId();
  const provider = modelProviderRegistry.get(providerId);
  const settings = configuredProviderSettings(providerId);

  let system: string;
  let messages: AgentMessage[];
  if (req.messages.length > 0) {
    // A later round already has its own system prompt baked into the conversation's
    // own shared understanding — but generateWithTools still needs a `system` string
    // every call (providers are stateless per-request), so this reloads the same
    // static file rather than requiring the client to carry it back and forth.
    system = compileAgentTurn({ scope: req.scope, instruction: "", contextText: "" }).system;
    messages = req.messages;
  } else {
    const compiled = compileAgentTurn({ scope: req.scope, instruction: req.instruction, contextText: req.contextText });
    system = compiled.system;
    messages = [{ role: "user", content: compiled.userMessage }];
  }

  return await provider.generateWithTools({
    system,
    messages,
    tools: req.tools,
    maxTokens: req.maxTokens ?? settings?.maxTokens,
    model: settings?.model,
  });
}

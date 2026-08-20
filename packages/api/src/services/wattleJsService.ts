import { modelProviderRegistry } from "@wattle/shared";
import { compileWattleJsPrompt } from "@wattle/prompt-engine";
import { activeProviderId } from "../providers/init.js";
import { configuredProviderSettings } from "../modelConfig.js";

/**
 * The one-shot half of the "js" CardType's sandboxed script system — same shape as
 * actionScriptService.ts's own generateActionScript, just against
 * prompts/wattle-js/system.md. See @wattle/web's lib/wattleJsJob.ts for the one
 * caller.
 */
export async function generateWattleJs(instruction: string, currentScript?: string): Promise<string> {
  const { systemPrompt, userMessage } = compileWattleJsPrompt({ instruction, currentScript });

  const providerId = activeProviderId();
  const provider = modelProviderRegistry.get(providerId);
  const settings = configuredProviderSettings(providerId);

  let text = "";
  for await (const chunk of provider.generate(userMessage, {
    systemPrompt,
    model: settings?.model,
    temperature: settings?.temperature,
    maxTokens: settings?.maxTokens,
  })) {
    text += chunk.text;
    if (chunk.done) break;
  }
  return text;
}

/**
 * The sandbox's own `wattle.ai(prompt, opts)` — a raw, one-shot model call with
 * no vault-context injection, no fixed system prompt, and no card side effects,
 * unlike `wattle.generate` above (which always goes through the app's own
 * "promptCard" action job and therefore always touches a real Card, if only
 * briefly, even in its "here" mode). This is the deliberately silent
 * primitive: nothing is created, saved, or shown anywhere unless the calling
 * script itself draws the returned text with `wattle.ui.*`.
 */
export async function runWattleAi(prompt: string, system?: string): Promise<string> {
  const providerId = activeProviderId();
  const provider = modelProviderRegistry.get(providerId);
  const settings = configuredProviderSettings(providerId);

  let text = "";
  for await (const chunk of provider.generate(prompt, {
    systemPrompt: system,
    model: settings?.model,
    temperature: settings?.temperature,
    maxTokens: settings?.maxTokens,
  })) {
    text += chunk.text;
    if (chunk.done) break;
  }
  return text;
}

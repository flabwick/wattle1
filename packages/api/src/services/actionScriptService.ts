import { modelProviderRegistry } from "@wattle/shared";
import { compileActionScriptPrompt } from "@wattle/prompt-engine";
import { activeProviderId } from "../providers/init.js";
import { configuredProviderSettings } from "../modelConfig.js";

/**
 * The one-shot half of the action-script system (the LLM-writable language the
 * "action" CardType's own step list is generated from — see @wattle/web's
 * lib/actionScript.ts for the parser/serializer and lib/actionScriptJob.ts for the
 * one caller). The static half of the system prompt lives in
 * packages/prompt-engine/prompts/action-script/system.md, same "plain markdown,
 * read fresh off disk, editable with no rebuild" convention every other prompt in
 * this app follows (see that folder's own README.md) — `compileActionScriptPrompt`
 * splices in `actionsDoc` (the runnable-action vocabulary, pre-rendered client-side
 * since the job registry itself is a browser-only module) and returns the finished
 * {systemPrompt, userMessage} pair. Same "compile a prompt, call the model,
 * accumulate one full string" shape as annotationService.ts's own callModel — short
 * structured text, not long-form streamed content, so there's no need for
 * generationService.ts's SSE/ghost-card machinery here either.
 */
export async function generateActionScript(
  actionsDoc: string,
  instruction: string,
  currentScript?: string,
): Promise<string> {
  const { systemPrompt, userMessage } = compileActionScriptPrompt({ actionsDoc, instruction, currentScript });

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

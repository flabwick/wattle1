import { modelRegistry } from "./modelRegistry.js";
import { claudeSonnet } from "./definitions/claudeSonnet.js";
import { gpt4oMini } from "./definitions/gpt4oMini.js";
import { geminiFlash } from "./definitions/geminiFlash.js";

let initialized = false;

/**
 * Registers every built-in ModelDefinition. Safe to call more than once —
 * subsequent calls are no-ops. Called by openRouterProvider before its first use
 * rather than requiring every consumer to remember to call it at startup.
 */
export function initModels(): void {
  if (initialized) return;
  modelRegistry.register(claudeSonnet);
  modelRegistry.register(gpt4oMini);
  modelRegistry.register(geminiFlash);
  initialized = true;
}

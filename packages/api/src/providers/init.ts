import { modelProviderRegistry } from "@wattle/shared";
import { anthropicProvider } from "./anthropicProvider.js";
import { stubProvider } from "./stubProvider.js";

let initialized = false;

/**
 * Registers every built-in ModelProvider. Call once at server startup (src/index.ts)
 * alongside the Step 1 operation init. Safe to call more than once — subsequent calls
 * are no-ops.
 */
export function initProviders(): void {
  if (initialized) return;
  modelProviderRegistry.register(stubProvider);
  modelProviderRegistry.register(anthropicProvider);
  initialized = true;
}

/**
 * Which provider id generationService should use. Honors an explicit MODEL_PROVIDER
 * env var; otherwise defaults to "anthropic" when ANTHROPIC_API_KEY is present, and
 * "stub" when it isn't — so a fresh checkout with no key configured still runs.
 */
export function activeProviderId(): string {
  if (process.env.MODEL_PROVIDER) return process.env.MODEL_PROVIDER;
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "stub";
}

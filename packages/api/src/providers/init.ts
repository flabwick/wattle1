import { modelProviderRegistry } from "@wattle/shared";
import { anthropicProvider } from "./anthropicProvider.js";
import { stubProvider } from "./stubProvider.js";
import { openRouterProvider } from "./openRouterProvider.js";

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
  modelProviderRegistry.register(openRouterProvider);
  initialized = true;
}

/**
 * Which provider id generationService should use. Honors an explicit MODEL_PROVIDER
 * env var; otherwise prefers "openrouter" when OPENROUTER_API_KEY is present (the
 * centralized model backend going forward), then "anthropic" when ANTHROPIC_API_KEY is
 * present, and "stub" when neither is — so a fresh checkout with no key configured
 * still runs.
 */
export function activeProviderId(): string {
  if (process.env.MODEL_PROVIDER) return process.env.MODEL_PROVIDER;
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "stub";
}

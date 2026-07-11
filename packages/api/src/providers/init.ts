import { modelProviderRegistry } from "@wattle/shared";
import { anthropicProvider } from "./anthropicProvider.js";
import { stubProvider } from "./stubProvider.js";
import { openRouterProvider } from "./openRouterProvider.js";
import { configuredProviderId } from "../modelConfig.js";

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
 * Which provider id generationService should use. config/model.config.json's
 * "activeProvider" (read fresh on every call — see ../modelConfig.ts) takes priority
 * when set; otherwise falls back to the env-var-based selection this always used: an
 * explicit MODEL_PROVIDER env var, else "openrouter" when OPENROUTER_API_KEY is
 * present, else "anthropic" when ANTHROPIC_API_KEY is present, else "stub" — so a fresh
 * checkout with no config or key configured still runs.
 */
export function activeProviderId(): string {
  const configured = configuredProviderId();
  if (configured) return configured;
  if (process.env.MODEL_PROVIDER) return process.env.MODEL_PROVIDER;
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "stub";
}

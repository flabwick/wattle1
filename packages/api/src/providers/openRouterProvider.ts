// The actual implementation lives in @wattle/prompt-engine alongside the model
// registry it depends on (see that package's src/providers/openRouterProvider.ts).
// Re-exported here so it registers the same way as the other providers in this
// directory (stubProvider.ts, anthropicProvider.ts) — see init.ts.
export { openRouterProvider } from "@wattle/prompt-engine";

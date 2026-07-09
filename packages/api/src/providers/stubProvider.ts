import type { ModelProvider } from "@wattle/shared";

const NO_CONTEXT = "(no context above)";

/**
 * Reproduces the pre-registry callModel() stub from generationService.ts: an echo-back
 * response with no real AI provider. Used when MODEL_PROVIDER is "stub" (the default),
 * or as the fallback when no ANTHROPIC_API_KEY is configured.
 *
 * The original stub counted context entries and listed only their titles, using the
 * raw GenerationContextEntry[] it was called with directly. ModelProvider.generate only
 * receives the already-rendered prompt string (title + content per entry, blank-line
 * separated — see @wattle/prompt-engine's "generate-from-context" template), so the
 * entry count here is recovered from that same separator rather than from structured
 * data. The visible shape of the response is unchanged.
 */
export const stubProvider: ModelProvider = {
  id: "stub",
  async *generate(prompt) {
    const entryCount = prompt.trim() === NO_CONTEXT ? 0 : prompt.split("\n\n").length;
    const text = [
      "_Stub response — wire up a real model call in generationService.ts._",
      "",
      `Context received (${entryCount} card${entryCount === 1 ? "" : "s"}):`,
      prompt,
    ].join("\n");
    yield { text, done: true };
  },
};

import type { ModelProvider } from "@wattle/shared";

const NO_CONTEXT = "(no context above)";

/**
 * Local dev / no-credentials fallback — used when config/model.config.json's
 * "activeProvider" (or MODEL_PROVIDER) is "stub", or as the ultimate fallback when no
 * provider key is configured at all. Echoes back the assembled context so a fresh
 * checkout can exercise the whole pipeline with no API key, wrapped in the same
 * `<card type="..." title="...">...</card>` output contract every real prompt commits
 * the model to (see @wattle/prompt-engine's prompts/README.md and
 * parsers/cardBlockParser.ts) — without this wrapping, streamGeneration's parser would
 * reject the stub's own output as a stream with no root card block.
 */
export const stubProvider: ModelProvider = {
  id: "stub",
  async *generate(prompt) {
    const entryCount = prompt.trim() === NO_CONTEXT ? 0 : prompt.split("\n\n").length;
    const body = [
      "_Stub response — no ModelProvider credentials configured._",
      "",
      `Context received (${entryCount} card${entryCount === 1 ? "" : "s"}):`,
      prompt,
    ].join("\n");
    yield { text: `<card type="note" title="Stub response">\n${body}\n</card>`, done: true };
  },
};

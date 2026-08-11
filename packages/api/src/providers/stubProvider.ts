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
  // No credentials to call a real model with, so this just proves the agent loop's
  // plumbing end-to-end (route → provider → client) without needing any API key: the
  // first time it sees a given tool list it "calls" the first tool offered, with
  // whatever the caller's own system/instruction text most recently asked for as a
  // best-effort guess at the input — then on the next turn (once a tool_result is
  // present in `messages`, i.e. the loop already ran that call) it ends the turn.
  async generateWithTools({ tools, messages }) {
    const alreadyCalledATool = messages.some(
      (m) => Array.isArray(m.content) && m.content.some((block) => block.type === "tool_result"),
    );
    if (alreadyCalledATool || tools.length === 0) {
      return {
        content: [{ type: "text", text: "Stub response — no ModelProvider credentials configured." }],
        stopReason: "end_turn",
      };
    }
    return {
      content: [
        { type: "text", text: `Stub calling "${tools[0].name}" (no credentials configured).` },
        { type: "tool_use", id: "stub-tool-call-1", name: tools[0].name, input: {} },
      ],
      stopReason: "tool_use",
    };
  },
};

import type { Card } from "@wattle/shared";
import * as api from "../api/client.js";
import { editCard, notifySaved } from "./cardStore.js";
import { parseActionScript, type ActionScriptResult } from "./actionScript.js";

/**
 * Turns a freshly generated "action" Card's own content into real
 * `metadata.action.steps` — the client-side half of the "guide the next
 * generation" auto-run pipeline (App.tsx's onGenerationAccepted). The generation
 * pipeline itself (generationService.ts) never special-cases CardType: an
 * "action" Card comes back from `acceptGeneration` exactly like any other, its
 * `content` holding whatever plain action-script text the model wrote (see
 * prompt-engine/prompts/interactive/system.md's "Action cards" section), not real
 * steps yet. This is the one place that gap gets closed — mirrors
 * actionScriptJob.ts's runGenerateSteps (parse, then editCard) exactly, just
 * sourced from generated content instead of a "Generate steps with AI" call.
 *
 * Deliberately reads `card.content` directly rather than through the usual
 * flattenToPlainText(htmlToDoc(...)) pipeline every other plain-text projection in
 * this app uses (Dock.tsx, VaultCardDetail.tsx): that pipeline parses content as
 * HTML, and ProseMirror's own DOM-parsing whitespace rules collapse a bare
 * newline down to a single space outside any preserve-whitespace context —
 * confirmed directly (a real generated action card's own content, round-tripped
 * through it, merged "AUTORUN" and the step line that followed it onto one line,
 * silently losing the step). Action-script text was never HTML to begin with
 * (the prompt explicitly tells the model not to use `<p>`/markup for it) and the
 * generation pipeline stores whatever the model streamed completely verbatim, so
 * the raw Card content already *is* the exact text to parse.
 *
 * Can't happen server-side: actionJobRegistry.ts (which parseActionScript
 * validates every job/field against) is a browser-only registry — see that
 * file's own doc comment.
 */
export async function materializeGeneratedActionCard(card: Card): Promise<ActionScriptResult> {
  const result = await parseActionScript(card.content, async (title) => {
    const page = await api.resolvePageByTitle(title);
    return { id: page.id, title: page.title };
  });

  if (result.errors.length === 0) {
    editCard(card.id, {
      metadata: {
        ...card.metadata,
        action: { label: result.label, steps: result.steps },
      },
      content: "",
    });
    notifySaved(card.id);
  }

  return result;
}

import type { Card } from "@wattle/shared";
import { editCard, notifySaved } from "./cardStore.js";
import { parseInputScript, type InputScriptResult } from "./inputScript.js";

/**
 * Turns a freshly generated "input" Card's own content into real
 * `metadata.input` — App.tsx's onGenerationAccepted calls this for any accepted
 * generation whose Card is an "input" type. Reads `card.content` directly rather
 * than through the usual flattenToPlainText(htmlToDoc(...)) pipeline every other
 * plain-text projection in this app uses (Dock.tsx, VaultCardDetail.tsx): that
 * pipeline parses content as HTML, and ProseMirror's own DOM-parsing whitespace
 * rules collapse a bare newline down to a single space outside any
 * preserve-whitespace context, silently corrupting the script. Input-script text
 * was never HTML to begin with, and the generation pipeline stores whatever the
 * model streamed completely verbatim, so the raw Card content already *is* the
 * exact text to parse.
 */
export async function materializeGeneratedInputCard(card: Card): Promise<InputScriptResult> {
  const result = parseInputScript(card.content);

  if (result.errors.length === 0 && result.kind) {
    editCard(card.id, {
      metadata: {
        ...card.metadata,
        input: { kind: result.kind, options: result.options, placeholder: result.placeholder, value: result.value },
      },
      content: "",
    });
    notifySaved(card.id);
  }

  return result;
}

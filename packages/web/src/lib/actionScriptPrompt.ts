import type { ActionFieldSpec } from "./actionJobRegistry.js";
import { actionJobRegistry } from "./actionJobRegistry.js";

function describeField(field: ActionFieldSpec): string {
  switch (field.kind) {
    case "text":
      return `  - ${field.key} (text) — ${field.label}`;
    case "richtext":
      return `  - ${field.key} (text, may include {{variableName}} tokens — see Variables below) — ${field.label}`;
    case "select":
      return `  - ${field.key} (one of: ${field.options.map((o) => o.value).join("|")}) — ${field.label}`;
    case "cardPicker":
      return `  - ${field.key} (step:N — an earlier step IN THIS SAME SCRIPT that creates a card — or card:<id> using a pageCardId you were given earlier) — ${field.label}`;
    case "vaultCardPicker":
      return `  - ${field.key} (step:N — an earlier step IN THIS SAME SCRIPT that creates a card — or card:<id> using a cardId you were given earlier) — ${field.label}`;
    case "pagePicker":
      return `  - ${field.key} (a quoted Page title — omit to use the current Page; the Page is created if no Page with that title exists yet) — ${field.label}`;
    case "templatePicker":
      return "";
  }
}

/**
 * Renders the entire runnable-action vocabulary (actionJobRegistry.ts) as plain
 * text a model can follow — generated straight from the registry every time it's
 * called, so it can never drift out of sync with the actual set of jobs/fields the
 * app supports (no hand-maintained copy to forget to update when a job is added).
 * Jobs with a "templatePicker" field (currently only openTemplate) are left out
 * entirely — see actionScript.ts's own doc comment for why a Template can't be
 * named from script text.
 *
 * This is the ONE dynamic piece of the action-script system prompt — everything
 * else (syntax rules, the Variables explanation, the output contract, a worked
 * example) is static prose that lives in
 * packages/prompt-engine/prompts/action-script/system.md, editable directly with
 * no rebuild (see that folder's own README.md). This function's own output is sent
 * to the server as `actionsDoc` (api/client.ts's generateActionScript) and spliced
 * into that markdown file's `<!-- ACTIONS -->` placeholder server-side
 * (@wattle/prompt-engine's actionScriptCompiler.ts) — it never becomes a whole
 * system prompt by itself. If you add a new job to actionJobRegistry.ts, this
 * function documents it automatically; you do NOT need to touch this file or the
 * markdown template unless the new job needs an explanation beyond its own
 * id/label/fields (e.g. a genuinely new *kind* of field, which would also need a
 * new case in describeField above).
 */
export function buildActionScriptActionsDoc(): string {
  return actionJobRegistry
    .list()
    .filter((job) => !job.fields.some((f) => f.kind === "templatePicker"))
    .map((job) => {
      const fieldLines = job.fields.map(describeField).filter(Boolean).join("\n");
      return `${job.id} — ${job.label()}${fieldLines ? `\n${fieldLines}` : ""}`;
    })
    .join("\n\n");
}

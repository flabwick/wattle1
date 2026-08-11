import type { ToolDefinition } from "@wattle/shared";
import type { ActionFieldSpec } from "./actionJobRegistry.js";
import { actionJobRegistry } from "./actionJobRegistry.js";

/**
 * Job ids the agent should never call directly — kept runnable for humans (a
 * hand-authored Action card's own step list, or "Generate steps with AI") but left
 * out of buildAgentToolDefinitions() below. Brilliantly Simple Generation Agent plan,
 * Phase 2's own exclude list: "openTemplate, navigate*, newBlankTab (side-effecty
 * UX)". `generateSteps` (actionScriptJob.ts, registered separately from this file)
 * is also excluded — it's the meta-job that itself calls an LLM to *write* a script,
 * meaningless for a tool-calling agent to call on itself.
 */
const EXCLUDED_JOB_IDS: ReadonlySet<string> = new Set([
  "openTemplate",
  "navigatePage",
  "navigateToPage",
  "newBlankTab",
  "generateSteps",
]);

/** One field's JSON-Schema property, plus the description text for it — split out
 *  so buildAgentToolDefinitions can merge it into `properties[field.key]` below. */
function fieldSchema(field: ActionFieldSpec): { schema: Record<string, unknown>; description: string } {
  switch (field.kind) {
    case "text":
    case "richtext":
      return { schema: { type: "string" }, description: field.label };
    case "select":
      return {
        schema: { type: "string", enum: field.options.map((o) => o.value) },
        description: `${field.label} (${field.options.map((o) => `${o.value} = ${o.label}`).join(", ")})`,
      };
    case "cardPicker":
      // Unlike the action-script text form (card:<id>/step:N), the agent always has
      // real ids already — the page context it was given lists every pageCardId
      // directly (useAgentLoop.ts).
      return { schema: { type: "string" }, description: `${field.label} — a pageCardId from your page context` };
    case "vaultCardPicker":
      return { schema: { type: "string" }, description: `${field.label} — a cardId from your context` };
    case "pagePicker":
      return { schema: { type: "string" }, description: `${field.label} — a Page id, or omit for the current page` };
    case "templatePicker":
      // Unreachable today (openTemplate, the only job with this field kind, is
      // always excluded above) — handled anyway so this switch stays exhaustive if
      // a future job ever adds one without also excluding itself.
      return { schema: { type: "string" }, description: field.label };
  }
}

/**
 * The agent's whole tool vocabulary, generated fresh from actionJobRegistry.ts every
 * time — same "never hand-maintained, can't drift" precedent
 * actionScriptPrompt.ts's buildActionScriptActionsDoc already established for the
 * older action-script system prompt. One ToolDefinition per included job: `name` is
 * the job id (so a tool_use block's `name` maps straight back to
 * `actionJobRegistry.get(name)`, no separate lookup table), `description` is the
 * job's own label, and `input_schema` is a flat `{ field.key: <JSON Schema> }`
 * object built from each field's own kind (see fieldSchema above).
 */
export function buildAgentToolDefinitions(): ToolDefinition[] {
  return actionJobRegistry
    .list()
    .filter((job) => !EXCLUDED_JOB_IDS.has(job.id))
    .map((job) => {
      const properties: Record<string, unknown> = {};
      for (const field of job.fields) {
        const { schema, description } = fieldSchema(field);
        properties[field.key] = { ...schema, description };
      }
      return {
        name: job.id,
        description: job.label(),
        input_schema: { type: "object", properties },
      };
    });
}

/** pageCardId → the rest of that PageCard's identity — exactly the lookup the agent
 *  loop's own scope:page context is already built from (useAgentLoop.ts), passed
 *  into toolInputToJobParams below so it never has to re-fetch anything. */
export interface PageCardLookup {
  get(pageCardId: string): { cardId: string; title: string } | undefined;
}

/**
 * Expands a tool call's flat `input` (one value per field key, exactly what the model
 * supplied) into the full jobParams object actionJobRegistry.ts's jobs actually run
 * against. Every field kind but "cardPicker" needs no expansion — the model's own
 * value already *is* the jobParams value for that key. A "cardPicker" field is the
 * one exception: its doc comment (actionJobRegistry.ts) says it writes three keys
 * (`{key}`, `{key}CardId`, `{key}Title`) because different jobs read different ones
 * (e.g. removeCard reads the plain PageCard id; addStackMember reads the `CardId`
 * variant) — normally ActionStepFields.tsx's picker UI fills in all three when a
 * human picks a card, so this does the same derivation for the agent, using the
 * pageCardId the model supplied plus the caller's own page-card lookup (built from
 * the very same context the model was given, so this can never miss).
 */
export function toolInputToJobParams(
  jobId: string,
  input: Record<string, unknown>,
  pageCards: PageCardLookup,
): Record<string, unknown> {
  const job = actionJobRegistry.get(jobId);
  if (!job) return input;
  const params: Record<string, unknown> = { ...input };
  for (const field of job.fields) {
    if (field.kind !== "cardPicker") continue;
    const pageCardId = input[field.key];
    if (typeof pageCardId !== "string" || !pageCardId) continue;
    const found = pageCards.get(pageCardId);
    if (found) {
      params[`${field.key}CardId`] = found.cardId;
      params[`${field.key}Title`] = found.title;
    }
  }
  return params;
}

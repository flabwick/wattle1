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

/**
 * Job ids left out of the tool set entirely for scope: "cards" (the Dock's
 * per-card "ask AI to edit" flow) — that flow promises the person their
 * selected cards get mutated in place and nothing else changes, so every job
 * that would add a new Card or Page to the workspace (rather than editing one
 * already in scope) is off the table here, even though it's still a fine tool
 * for the page-wide agent (scope: "page", App.tsx's own separate flow).
 * - createCard, promptCard: the two direct ways to add a new Card. promptCard
 *   in particular routes through the older streamed-generation pipeline
 *   (prompts/interactive/system.md), which can itself emit further `<card>`
 *   tags (including an "input" card asking a question) — a second, older
 *   card-creation path this exclusion list has to name separately from
 *   createCard, since it doesn't go through this agent's own tool-call loop
 *   at all once triggered.
 * - createPage, createChildPage: add a whole new Page.
 * - linkExistingCard, copyExistingCard: bring a different, unrelated Card
 *   onto the page (or a copy of one) — not an edit to what's selected.
 * - createStack, convertToStack, addStackMember: each creates a new stack
 *   container Card (or a new blank alternate) under the hood.
 * - runCard: replays a saved Action card's own step list, which may itself
 *   contain any of the jobs above — same loophole, closed the same way.
 */
const CARDS_SCOPE_EXCLUDED_JOB_IDS: ReadonlySet<string> = new Set([
  "createCard",
  "promptCard",
  "createPage",
  "createChildPage",
  "linkExistingCard",
  "copyExistingCard",
  "createStack",
  "convertToStack",
  "addStackMember",
  "runCard",
]);

/**
 * Job id + field key pairs whose "select" options get trimmed for scope: "cards"
 * — annotateCard/process drops "diff", the one process that does NOT apply
 * itself (system.md: "a deliberate human-approval step you cannot skip"),
 * which is the exact "not actually done yet" gap this flow shouldn't leave the
 * person with. footnote/highlight both apply immediately and stay available.
 */
const CARDS_SCOPE_OPTION_EXCLUSIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  "annotateCard.process": new Set(["diff"]),
};

/** One field's JSON-Schema property, plus the description text for it — split out
 *  so buildAgentToolDefinitions can merge it into `properties[field.key]` below. */
function fieldSchema(field: ActionFieldSpec, excluded?: ReadonlySet<string>): { schema: Record<string, unknown>; description: string } {
  switch (field.kind) {
    case "text":
    case "richtext":
      return { schema: { type: "string" }, description: field.label };
    case "select": {
      const options = excluded ? field.options.filter((o) => !excluded.has(o.value)) : field.options;
      return {
        schema: { type: "string", enum: options.map((o) => o.value) },
        description: `${field.label} (${options.map((o) => `${o.value} = ${o.label}`).join(", ")})`,
      };
    }
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
export function buildAgentToolDefinitions(scope: "page" | "cards" = "page"): ToolDefinition[] {
  return actionJobRegistry
    .list()
    .filter((job) => !EXCLUDED_JOB_IDS.has(job.id))
    .filter((job) => scope !== "cards" || !CARDS_SCOPE_EXCLUDED_JOB_IDS.has(job.id))
    .map((job) => {
      const properties: Record<string, unknown> = {};
      for (const field of job.fields) {
        const excluded = scope === "cards" ? CARDS_SCOPE_OPTION_EXCLUSIONS[`${job.id}.${field.key}`] : undefined;
        const { schema, description } = fieldSchema(field, excluded);
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

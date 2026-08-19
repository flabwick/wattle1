import type { ActionStep, PageCardWithCard } from "@wattle/shared";
import * as api from "../api/client.js";
import type { AnnotationProcess } from "../api/client.js";
import { editCard, ensureCardLoaded, notifySaved } from "./cardStore.js";
import { t } from "../i18n/index.js";

/** A Prompt Card's context mode: "context" is the normal Generation Rule
 *  (everything above, same as any other generation); "own" skips it entirely, so
 *  the model sees only the configured instructions (plus whatever any embedded
 *  card-link placeholders inside them resolve to — see generationService.ts's
 *  resolveInstructionEmbeds). */
export type PromptCardContextMode = "context" | "own";

/** What a step "produced" — currently only a card-creating step (createCard,
 *  copyExistingCard, linkExistingCard) returns one, so a later step's own
 *  target/vaultCardPicker field can reference "the card step N produced" (see
 *  ActionCardView.tsx's runSteps and its `step:<stepId>` resolution) rather than
 *  needing to know a real id ahead of time — the whole point being step-to-step
 *  chaining without a general scripting language: this is the one piece of
 *  "output" a step can hand forward, nothing else. */
export interface StepOutput {
  cardId: string;
  pageCardId: string;
}

/**
 * The handful of jobs that need real App.tsx-level state (generation streaming,
 * page navigation, Template-opening) rather than a plain api call — everything
 * else in the registry below is self-contained (calls the api client or editCard
 * directly, then notifySaved, same pattern the "operation" CardType used before it
 * was folded into "action"). App.tsx's handleRunActionJob builds the one concrete
 * instance of this.
 */
export interface ActionJobContext {
  /** `createCard`'s params: blank if `title`/`content` are both empty, same as the
   *  Feed Input Button's own "+". `content` may contain a `<wattle-embed
   *  data-card-id="...">` reference (inserted via ActionStepFields' own link
   *  picker), pointing at a hidden Card or any other Card — rendered as a normal
   *  embed like any note's. `pageId`, omitted, defaults to this button's own Page.
   *  `typeId`, omitted, creates a plain "note" (the server's own default —
   *  cardMetadata.ts's `typeId` is left absent, not set to "note" explicitly — see
   *  getCardTypeId.ts's `?? "note"` fallback) — every type-specific metadata
   *  sub-object (action/input/prompt/etc.) is itself optional in
   *  cardMetadataV1Schema, so `{ version: 1, typeId }` alone is enough to create a
   *  valid Card of that type with its own type's defaults; "stack" is deliberately
   *  not offered here (the `createStack` job below does the extra work a Stack
   *  needs — an initial member — that a bare createCard can't). Returns the created
   *  Card/PageCard's own ids — see StepOutput above. */
  onCreateCard: (
    pageCard: PageCardWithCard,
    title: string,
    content: string,
    pageId?: string,
    typeId?: string,
  ) => Promise<StepOutput>;
  /** Opens a Template — a brand-new Tab (scope "tab") or a new Page in the current
   *  Tab (scope "page"), same as the Template browser's own Open action. */
  onOpenTemplate: (templateId: string) => Promise<void>;
  /** Triggers a generation anchored at this button's own position (ghost card
   *  streams in immediately below it, then auto-saves on completion) — awaitable
   *  (useGeneration.ts's startAndWait), so a multi-step Run or the agent loop's own
   *  generateCard tool can wait for the result before moving on, unlike this job's
   *  original fire-and-forget behavior. Resolves the created Card's own ids (see
   *  StepOutput above) once the stream lands and saves; `void` if nothing was
   *  generated (an empty response). */
  onPromptCard: (
    pageCard: PageCardWithCard,
    instructions: string,
    contextMode: PromptCardContextMode,
  ) => Promise<StepOutput | void>;
  /** A brand-new blank Page in the current Tab. */
  onNewBlankPage: () => Promise<void>;
  /** A brand-new Tab with one blank Page, navigated to immediately. */
  onNewBlankTab: () => Promise<void>;
  /** Same as the Dock's page-nav up/down arrows — a no-op at either end. */
  onNavigatePage: (direction: "up" | "down") => Promise<void>;
  /** Navigates straight to a specific Page (unlike onNavigatePage's relative
   *  up/down) — same navigation App.tsx's own Pages panel/search results use. */
  onNavigateToPage: (pageId: string) => Promise<void>;
  /** Removes one specific *other* Card from the current Page (never the Card this
   *  button lives in, never the vault copy). Silently does nothing if the target
   *  PageCard no longer exists. */
  onRemoveCard: (targetPageCardId: string) => Promise<void>;
  /** Commits one specific *other* Card's current draft to the vault. */
  onSaveCard: (targetPageCardId: string) => Promise<void>;
}

export type ActionFieldSpec =
  | { kind: "text"; key: string; label: string; placeholder?: string }
  | { kind: "richtext"; key: string; label: string; placeholder?: string }
  | { kind: "select"; key: string; label: string; options: ReadonlyArray<{ value: string; label: string }> }
  /** Dynamic options fetched from `listTemplates()` — the one field kind
   *  ActionStepFields.tsx special-cases with its own data fetch, since it's the
   *  only job param that needs live server data rather than a fixed list. */
  | { kind: "templatePicker"; key: string; label: string }
  /** A `<select>` over the current Page's own siblings (ActionStepFields.tsx), same
   *  "pick a card on this page" convention the old ActionJobFields.tsx already used.
   *  Writes three jobParams keys: `{key}` (the picked PageCard id, for re-selecting),
   *  `{key}CardId` (the underlying Card id — what most jobs actually act on), and
   *  `{key}Title` (a cached display label). */
  | { kind: "cardPicker"; key: string; label: string }
  /** CardLinkPicker (ActionStepFields.tsx) — search-as-you-type across the *whole*
   *  vault, not just this Page's own siblings, for jobs that act on a Card by id
   *  regardless of where (or whether) it's currently placed on any Page. Writes
   *  `{key}` (the Card id) and `{key}Title` (a cached display label) — no separate
   *  PageCard id, since there may not be one. */
  | { kind: "vaultCardPicker"; key: string; label: string }
  /** PageLinkPicker (ActionStepFields.tsx). Writes `{key}` (Page id) and
   *  `{key}Title` (cached display label). */
  | { kind: "pagePicker"; key: string; label: string };

export interface ActionJobDefinition {
  id: string;
  label: () => string;
  fields: ActionFieldSpec[];
  /** Returns a StepOutput for the handful of jobs that create/attach a Card
   *  (createCard, copyExistingCard, linkExistingCard) — every other job returns
   *  nothing, since there's no new Card for a later step to reference. */
  run: (
    ctx: ActionJobContext,
    pageCard: PageCardWithCard,
    jobParams: Record<string, unknown>,
  ) => Promise<StepOutput | void>;
}

/**
 * The runnable-action vocabulary every "action" Card's own step list, and every
 * inline actionButton node, picks from — a real registry (mirrors
 * @wattle/shared's CardTypeRegistry/OperationRegistry idiom: id → definition map,
 * register/get/list) rather than a hardcoded if-chain, so a new job means one new
 * `register()` call here, not new JSX at every call site that renders a job's
 * fields. See ActionStepFields.tsx for the one generic renderer that turns a job's
 * `fields` into actual controls.
 */
export class ActionJobRegistry {
  private readonly jobs = new Map<string, ActionJobDefinition>();

  /** Before adding a new job, see `packages/shared/src/registries/README.md`'s
   *  "Adding a new action job" section and `docs/adding-features.md` at the repo
   *  root. Short version: a job's id/label/fields are picked up automatically by
   *  the action-script LLM system prompt (actionScriptPrompt.ts's
   *  buildActionScriptActionsDoc, spliced into packages/prompt-engine/prompts/
   *  action-script/system.md) — you only need to touch that prompt by hand if this
   *  job introduces a new field *kind* (ActionFieldSpec above) or needs an
   *  explanation beyond its own fields. */
  register(job: ActionJobDefinition): void {
    if (this.jobs.has(job.id)) {
      throw new Error(`ActionJob "${job.id}" is already registered`);
    }
    this.jobs.set(job.id, job);
  }

  get(id: string): ActionJobDefinition | undefined {
    return this.jobs.get(id);
  }

  has(id: string): boolean {
    return this.jobs.has(id);
  }

  list(): ActionJobDefinition[] {
    return [...this.jobs.values()];
  }
}

export const actionJobRegistry = new ActionJobRegistry();

/** The `{{name}}` token a text/richtext field can contain, referencing one of the
 *  button's own `metadata.properties` entries by its `key`. Deliberately just this
 *  — no expressions, no logic, nothing to "code" — a name in double curly braces
 *  that gets swapped for that property's current value right before a step runs.
 *  Matches non-greedily so `{{a}}{{b}}` splits into two tokens, not one. */
const VARIABLE_TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;

function substituteVariables(value: string, properties: ReadonlyArray<{ key: string; value: string }>): string {
  return value.replace(VARIABLE_TOKEN, (token, name: string) => {
    const prop = properties.find((p) => p.key === name);
    return prop ? prop.value : token;
  });
}

/**
 * Resolves every `{{name}}` token in a step's own string jobParams against the
 * button Card's own `metadata.properties` — run once, centrally, right before a
 * job executes (runActionJob in actionJobs.ts), so every job's own `run()` above
 * just sees plain resolved strings and never has to know templating exists. An
 * unrecognized `{{name}}` (typo, or the property was since removed) is left as
 * literal text rather than erroring — the same "fail visibly but don't block the
 * rest of the run" spirit a missing/renamed target Card already gets elsewhere in
 * this file.
 */
export function resolveJobParams(
  jobParams: Record<string, unknown>,
  properties: ReadonlyArray<{ key: string; value: string }>,
): Record<string, unknown> {
  if (properties.length === 0) return jobParams;
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(jobParams)) {
    resolved[key] = typeof value === "string" ? substituteVariables(value, properties) : value;
  }
  return resolved;
}

/** The sentinel a "cardPicker"/"vaultCardPicker" field's own value holds when it
 *  points at an earlier step's own StepOutput instead of a real id picked ahead of
 *  time (ActionStepFields.tsx's own step-reference option, CardInfoPanel.tsx's
 *  stepOptions) — a real Card/PageCard id is a cuid and never contains ":", so this
 *  is unambiguous without needing a separate flag field. */
const STEP_REF_PREFIX = "step:";

export function stepRefValue(stepId: string): string {
  return `${STEP_REF_PREFIX}${stepId}`;
}

/**
 * Swaps any `step:<stepId>` sentinel in a step's own jobParams for the real id
 * `stepOutputs` recorded for that earlier step — run once per step, right before
 * dispatch (ActionCardView.tsx's runSteps), using *that step's own* field specs to
 * know which convention each field expects: "cardPicker" fields read a PageCard id
 * directly (StepOutput.pageCardId), "vaultCardPicker" fields read a Card id
 * directly (StepOutput.cardId) — see each field kind's own doc comment above. A
 * reference to a step that hasn't produced anything (wrong kind, or simply hasn't
 * run yet — a forward reference) is left as the literal `step:...` string, which
 * every job's own `requireStr`/`str` treats as "just some non-matching id", so it
 * fails the same clear way a stale picked id already does elsewhere in this file.
 */
export function resolveStepReferences(
  jobParams: Record<string, unknown>,
  fields: ActionFieldSpec[],
  stepOutputs: ReadonlyMap<string, StepOutput>,
): Record<string, unknown> {
  const resolved = { ...jobParams };
  for (const field of fields) {
    if (field.kind !== "cardPicker" && field.kind !== "vaultCardPicker") continue;
    const value = resolved[field.key];
    if (typeof value !== "string" || !value.startsWith(STEP_REF_PREFIX)) continue;
    const output = stepOutputs.get(value.slice(STEP_REF_PREFIX.length));
    if (!output) continue;
    resolved[field.key] = field.kind === "cardPicker" ? output.pageCardId : output.cardId;
  }
  return resolved;
}

export interface RunActionStepsResult {
  /** How many steps actually completed before either running out or hitting an
   *  error — lets a caller report "ran 2 of 5" rather than just pass/fail. */
  ranCount: number;
  /** The first failing step's own error message, same "stop and report, don't run
   *  the rest" behavior every caller of this wants — null on a clean run through
   *  every step. */
  error: string | null;
  /** Every card a step in this run created (createCard/copyExistingCard/
   *  linkExistingCard), in run order — App.tsx's onGenerationAccepted folds these
   *  into the next AUTORUN round's own summary so the model can act on a card an
   *  *earlier* round created via the `card:<id>` form (actionScript.ts), not just
   *  `step:N` within one script. `title` is whatever the step's own `title`
   *  jobParam held (createCard only) — undefined for a copy/link step. */
  created: { title: string | undefined; cardId: string; pageCardId: string }[];
}

/**
 * Runs a whole action-Card's step list in order, stopping at the first failure —
 * the shared core of ActionCardView.tsx's own Run button (which wraps this with its
 * own `running`/`runError` UI state) and the "guide the next generation" pipeline's
 * auto-run path (App.tsx), which calls this directly the moment a freshly generated
 * `AUTORUN` action Card's steps are parsed and written, with no button tap involved.
 * `onRunActionJob` is the same dispatcher both callers already have to hand —
 * App.tsx's handleRunActionJob (lib/actionJobs.ts's runActionJob, ctx-bound).
 */
export async function runActionSteps(
  pageCard: PageCardWithCard,
  steps: ActionStep[],
  onRunActionJob: (
    pageCard: PageCardWithCard,
    jobId: string | undefined,
    jobParams: Record<string, unknown> | undefined,
  ) => Promise<StepOutput | void>,
): Promise<RunActionStepsResult> {
  const stepOutputs = new Map<string, StepOutput>();
  const created: RunActionStepsResult["created"] = [];
  let ranCount = 0;
  for (const step of steps) {
    try {
      const job = actionJobRegistry.get(step.jobId);
      const jobParams = job ? resolveStepReferences(step.jobParams, job.fields, stepOutputs) : step.jobParams;
      const result = await onRunActionJob(pageCard, step.jobId, jobParams);
      if (result) {
        stepOutputs.set(step.id, result);
        const title = typeof step.jobParams.title === "string" ? step.jobParams.title : undefined;
        created.push({ title, cardId: result.cardId, pageCardId: result.pageCardId });
      }
      ranCount++;
    } catch (err) {
      return { ranCount, error: err instanceof Error ? err.message : String(err), created };
    }
  }
  return { ranCount, error: null, created };
}

/** Exported for actionScriptJob.ts's own "generateSteps" job — kept here rather
 *  than duplicated since every other job in this file already uses them. */
export function str(jobParams: Record<string, unknown>, key: string): string {
  const value = jobParams[key];
  return typeof value === "string" ? value : "";
}

export function requireStr(jobParams: Record<string, unknown>, key: string): string {
  const value = str(jobParams, key);
  if (!value) throw new Error(t("actionCard.error.missingField"));
  return value;
}

// --- App-state-bound jobs (need ActionJobContext) ------------------------------

actionJobRegistry.register({
  id: "createCard",
  label: () => t("actionCard.job.createCard"),
  fields: [
    { kind: "text", key: "title", label: t("actionCard.field.title"), placeholder: t("card.titlePlaceholder") },
    { kind: "richtext", key: "content", label: t("actionCard.field.content") },
    { kind: "pagePicker", key: "page", label: t("actionCard.field.page") },
    {
      kind: "select",
      key: "typeId",
      label: t("actionCard.field.typeId"),
      options: [
        { value: "note", label: t("actionCard.createCard.typeNote") },
        { value: "action", label: t("actionCard.createCard.typeAction") },
        { value: "prompt", label: t("actionCard.createCard.typePrompt") },
        { value: "input", label: t("actionCard.createCard.typeInput") },
        { value: "pageLinks", label: t("actionCard.createCard.typePageLinks") },
        { value: "search", label: t("actionCard.createCard.typeSearch") },
        { value: "js", label: t("actionCard.createCard.typeJs") },
      ],
    },
  ],
  run: async (ctx, pageCard, jobParams) => {
    return await ctx.onCreateCard(
      pageCard,
      str(jobParams, "title"),
      str(jobParams, "content"),
      str(jobParams, "page") || undefined,
      str(jobParams, "typeId") || undefined,
    );
  },
});

actionJobRegistry.register({
  id: "promptCard",
  label: () => t("actionCard.job.promptCard"),
  fields: [
    { kind: "richtext", key: "instructions", label: t("actionCard.field.instructions") },
    {
      kind: "select",
      key: "contextMode",
      label: t("actionCard.field.context"),
      options: [
        { value: "context", label: t("actionCard.promptCard.contextAbove") },
        { value: "own", label: t("actionCard.promptCard.contextOwn") },
      ],
    },
  ],
  run: async (ctx, pageCard, jobParams) => {
    const contextMode: PromptCardContextMode = jobParams.contextMode === "own" ? "own" : "context";
    return await ctx.onPromptCard(pageCard, str(jobParams, "instructions"), contextMode);
  },
});

actionJobRegistry.register({
  id: "openTemplate",
  label: () => t("actionCard.job.openTemplate"),
  fields: [{ kind: "templatePicker", key: "templateId", label: t("actionCard.field.template") }],
  run: async (ctx, _pageCard, jobParams) => {
    const templateId = str(jobParams, "templateId");
    if (templateId) await ctx.onOpenTemplate(templateId);
  },
});

actionJobRegistry.register({
  id: "newBlankPage",
  label: () => t("actionCard.job.newBlankPage"),
  fields: [],
  run: async (ctx) => {
    await ctx.onNewBlankPage();
  },
});

actionJobRegistry.register({
  id: "newBlankTab",
  label: () => t("actionCard.job.newBlankTab"),
  fields: [],
  run: async (ctx) => {
    await ctx.onNewBlankTab();
  },
});

actionJobRegistry.register({
  id: "navigatePage",
  label: () => t("actionCard.job.navigatePage"),
  fields: [
    {
      kind: "select",
      key: "direction",
      label: t("actionCard.field.direction"),
      options: [
        { value: "up", label: t("actionCard.navigatePage.up") },
        { value: "down", label: t("actionCard.navigatePage.down") },
      ],
    },
  ],
  run: async (ctx, _pageCard, jobParams) => {
    await ctx.onNavigatePage(jobParams.direction === "up" ? "up" : "down");
  },
});

actionJobRegistry.register({
  id: "navigateToPage",
  label: () => t("actionCard.job.navigateToPage"),
  fields: [{ kind: "pagePicker", key: "page", label: t("actionCard.field.page") }],
  run: async (ctx, _pageCard, jobParams) => {
    await ctx.onNavigateToPage(requireStr(jobParams, "page"));
  },
});

actionJobRegistry.register({
  id: "removeCard",
  label: () => t("actionCard.job.removeCard"),
  fields: [{ kind: "cardPicker", key: "target", label: t("actionCard.field.target") }],
  run: async (ctx, _pageCard, jobParams) => {
    const targetPageCardId = str(jobParams, "target");
    if (targetPageCardId) await ctx.onRemoveCard(targetPageCardId);
  },
});

actionJobRegistry.register({
  id: "saveCard",
  label: () => t("actionCard.job.saveCard"),
  fields: [{ kind: "cardPicker", key: "target", label: t("actionCard.field.target") }],
  run: async (ctx, _pageCard, jobParams) => {
    const targetPageCardId = str(jobParams, "target");
    if (targetPageCardId) await ctx.onSaveCard(targetPageCardId);
  },
});

// --- Self-contained jobs (api.*/editCard directly, no App.tsx state needed) ----

actionJobRegistry.register({
  id: "renameCard",
  label: () => t("actionCard.job.renameCard"),
  fields: [
    { kind: "vaultCardPicker", key: "target", label: t("actionCard.field.target") },
    { kind: "text", key: "title", label: t("actionCard.field.title"), placeholder: t("card.titlePlaceholder") },
  ],
  run: async (_ctx, _pageCard, jobParams) => {
    const cardId = requireStr(jobParams, "target");
    await api.updateCard(cardId, { title: str(jobParams, "title") });
    notifySaved(cardId);
  },
});

actionJobRegistry.register({
  id: "editCard",
  label: () => t("actionCard.job.editCard"),
  fields: [
    { kind: "vaultCardPicker", key: "target", label: t("actionCard.field.target") },
    { kind: "text", key: "title", label: t("actionCard.field.title"), placeholder: t("card.titlePlaceholder") },
    { kind: "richtext", key: "content", label: t("actionCard.field.content") },
  ],
  // `title` is optional (omitted/blank leaves the existing title untouched) —
  // added for the wattle-js sandbox's own `wattle.editCard(id, {title, content})`
  // (wattleSdkHost.ts), which needs both; every existing caller of this job
  // (script/manual step editors) that never set `title` keeps behaving exactly
  // as before, since an empty string here is treated as "no change", not "clear
  // the title".
  run: async (_ctx, _pageCard, jobParams) => {
    const cardId = requireStr(jobParams, "target");
    const title = str(jobParams, "title");
    await api.updateCard(cardId, { content: str(jobParams, "content"), ...(title ? { title } : {}) });
    notifySaved(cardId);
  },
});

actionJobRegistry.register({
  id: "deleteCard",
  label: () => t("actionCard.job.deleteCard"),
  fields: [{ kind: "cardPicker", key: "target", label: t("actionCard.field.target") }],
  run: async (_ctx, pageCard, jobParams) => {
    const targetPageCardId = requireStr(jobParams, "target");
    await api.deletePageCardEntirely(targetPageCardId);
    notifySaved(pageCard.card.id);
  },
});

actionJobRegistry.register({
  id: "moveCard",
  label: () => t("actionCard.job.moveCard"),
  fields: [
    { kind: "cardPicker", key: "target", label: t("actionCard.field.target") },
    { kind: "pagePicker", key: "destPage", label: t("actionCard.field.destPage") },
  ],
  run: async (_ctx, pageCard, jobParams) => {
    const targetPageCardId = requireStr(jobParams, "target");
    // A huge destIndex, not the destination's real length — pageCardService.
    // movePageCard already clamps it down to "append at the end" server-side.
    await api.movePageCard(targetPageCardId, str(jobParams, "destPage") || pageCard.pageId, 999999);
    notifySaved(pageCard.card.id);
  },
});

actionJobRegistry.register({
  id: "createPage",
  label: () => t("actionCard.job.createPage"),
  fields: [{ kind: "text", key: "title", label: t("actionCard.field.title"), placeholder: t("card.titlePlaceholder") }],
  run: async (_ctx, pageCard, jobParams) => {
    await api.createPage(str(jobParams, "title") || undefined);
    notifySaved(pageCard.card.id);
  },
});

actionJobRegistry.register({
  id: "createChildPage",
  label: () => t("actionCard.job.createChildPage"),
  // Same "create from a page" shape as the Feed Input's own "New Page" tile
  // (handleCreateChildPage in App.tsx) and the WYSIWYG page-link picker's own
  // create-on-missing row: a new Page nested under `page` (defaulting to this
  // step's own Page), with a link-back Card left on `page` so it stays reachable.
  // Returns that link-back Card as this step's StepOutput, same as createStack.
  fields: [
    { kind: "text", key: "title", label: t("actionCard.field.title"), placeholder: t("card.titlePlaceholder") },
    { kind: "pagePicker", key: "page", label: t("actionCard.field.page") },
  ],
  run: async (_ctx, pageCard, jobParams) => {
    const parentId = str(jobParams, "page") || pageCard.pageId;
    const child = await api.createChildPage(parentId, str(jobParams, "title") || undefined);
    notifySaved(child.linkCardId);
    return { cardId: child.linkCardId, pageCardId: child.linkPageCardId };
  },
});

actionJobRegistry.register({
  id: "linkExistingCard",
  label: () => t("actionCard.job.linkExistingCard"),
  fields: [
    { kind: "vaultCardPicker", key: "source", label: t("actionCard.field.source") },
    { kind: "pagePicker", key: "page", label: t("actionCard.field.page") },
  ],
  run: async (_ctx, pageCard, jobParams) => {
    const sourceId = requireStr(jobParams, "source");
    const pc = await api.addExistingCardToPage(str(jobParams, "page") || pageCard.pageId, sourceId);
    notifySaved(pageCard.card.id);
    return { cardId: pc.cardId, pageCardId: pc.id };
  },
});

actionJobRegistry.register({
  id: "copyExistingCard",
  label: () => t("actionCard.job.copyExistingCard"),
  fields: [
    { kind: "vaultCardPicker", key: "source", label: t("actionCard.field.source") },
    { kind: "pagePicker", key: "page", label: t("actionCard.field.page") },
  ],
  run: async (_ctx, pageCard, jobParams) => {
    const sourceId = requireStr(jobParams, "source");
    const source = await api.getCard(sourceId);
    const pc = await api.addNewCardToPage(str(jobParams, "page") || pageCard.pageId, source.title, source.content);
    notifySaved(pageCard.card.id);
    return { cardId: pc.card.id, pageCardId: pc.id };
  },
});

actionJobRegistry.register({
  id: "runCard",
  label: () => t("actionCard.job.runCard"),
  fields: [{ kind: "vaultCardPicker", key: "target", label: t("actionCard.field.target") }],
  // "Executing" a Card step 1 created/referenced (the workflow this whole
  // step-reference system was built for) — only meaningful for an "action"-typed
  // Card, since that's the one CardType whose own steps this can re-dispatch
  // through the exact same registry, no streaming/generation-await problem to
  // solve. Runs the target's own steps against *this* step's own `pageCard` (the
  // outer button), not the target's — the target may not even be on a Page, so
  // there's nothing more sensible for its own nested createCard/etc. steps to
  // default to. Does not itself return a StepOutput: its own nested steps' ids
  // aren't visible to the *outer* run's own step-reference resolution — running a
  // Card and reaching into what it happened to create is a step too far past
  // "simple" for this to take on right now.
  run: async (ctx, pageCard, jobParams) => {
    const cardId = requireStr(jobParams, "target");
    const target = await ensureCardLoaded(cardId);
    if (target.metadata.typeId !== "action") {
      throw new Error(t("actionCard.error.notAnAction"));
    }
    for (const step of target.metadata.action?.steps ?? []) {
      const job = actionJobRegistry.get(step.jobId);
      if (!job) continue;
      const resolved = resolveJobParams(step.jobParams, target.metadata.properties ?? []);
      await job.run(ctx, pageCard, resolved);
    }
    notifySaved(cardId);
  },
});

actionJobRegistry.register({
  id: "reorderCards",
  label: () => t("actionCard.job.reorderCards"),
  fields: [
    { kind: "pagePicker", key: "page", label: t("actionCard.field.page") },
    // No dedicated field kind for "a list of ids" — comma-separated text, same
    // convention setInputValue's own "value" field already uses for its own
    // multi-value case.
    { kind: "text", key: "orderedIds", label: t("actionCard.field.orderedIds"), placeholder: "id1, id2, id3" },
  ],
  run: async (_ctx, pageCard, jobParams) => {
    const pageId = str(jobParams, "page") || pageCard.pageId;
    const orderedIds = str(jobParams, "orderedIds")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (orderedIds.length === 0) throw new Error(t("actionCard.error.missingField"));
    await api.reorderPageCards(pageId, orderedIds);
    notifySaved(pageCard.card.id);
  },
});

actionJobRegistry.register({
  id: "createStack",
  label: () => t("actionCard.job.createStack"),
  fields: [{ kind: "pagePicker", key: "page", label: t("actionCard.field.page") }],
  run: async (_ctx, pageCard, jobParams) => {
    const pageId = str(jobParams, "page") || pageCard.pageId;
    const created = await api.createStack(pageId);
    notifySaved(created.card.id);
    return { cardId: created.card.id, pageCardId: created.id };
  },
});

actionJobRegistry.register({
  id: "convertToStack",
  label: () => t("actionCard.job.convertToStack"),
  fields: [{ kind: "cardPicker", key: "target", label: t("actionCard.field.target") }],
  run: async (_ctx, pageCard, jobParams) => {
    const targetPageCardId = requireStr(jobParams, "target");
    const converted = await api.convertCardToStack(targetPageCardId);
    notifySaved(pageCard.card.id);
    return { cardId: converted.card.id, pageCardId: converted.id };
  },
});

actionJobRegistry.register({
  id: "addStackMember",
  label: () => t("actionCard.job.addStackMember"),
  // `target` picks the Stack's own PageCard on this Page — stackService's own
  // routes key on the Stack container's *Card* id though (not its PageCard id), so
  // this reads the cardPicker's own `{key}CardId` variant, same convention
  // deleteCard/moveCard's "target" fields already rely on.
  fields: [{ kind: "cardPicker", key: "target", label: t("actionCard.field.target") }],
  run: async (_ctx, pageCard, jobParams) => {
    const stackCardId = requireStr(jobParams, "targetCardId");
    await api.addStackMember(stackCardId);
    notifySaved(pageCard.card.id);
  },
});

actionJobRegistry.register({
  id: "removeStackMember",
  label: () => t("actionCard.job.removeStackMember"),
  // No picker kind covers a StackMember row id (distinct from any Card/PageCard id
  // the existing pickers resolve) — plain text; the agent's own page context
  // (useAgentLoop.ts) lists each Stack's member ids directly for this job to
  // consume. The manual Action-card editor has no live picker for this field
  // either, same limitation, until a dedicated field kind is worth adding.
  fields: [{ kind: "text", key: "memberId", label: t("actionCard.field.memberId") }],
  run: async (_ctx, pageCard, jobParams) => {
    const memberId = requireStr(jobParams, "memberId");
    await api.removeStackMember(memberId);
    notifySaved(pageCard.card.id);
  },
});

actionJobRegistry.register({
  id: "hideCard",
  label: () => t("actionCard.job.hideCard"),
  fields: [{ kind: "vaultCardPicker", key: "target", label: t("actionCard.field.target") }],
  run: async (_ctx, _pageCard, jobParams) => {
    const cardId = requireStr(jobParams, "target");
    const card = await ensureCardLoaded(cardId);
    editCard(cardId, { metadata: { ...card.metadata, hidden: !card.metadata.hidden } });
    notifySaved(cardId);
  },
});

actionJobRegistry.register({
  id: "pinPage",
  label: () => t("actionCard.job.pinPage"),
  fields: [{ kind: "pagePicker", key: "page", label: t("actionCard.field.page") }],
  run: async (_ctx, pageCard, jobParams) => {
    const pageId = requireStr(jobParams, "page");
    const pinned = await api.listPinnedPages();
    const isPinned = pinned.some((p) => p.id === pageId);
    await api.setPagePinned(pageId, isPinned ? null : pinned.length);
    notifySaved(pageCard.card.id);
  },
});

actionJobRegistry.register({
  id: "freezeCard",
  label: () => t("actionCard.job.freezeCard"),
  fields: [{ kind: "vaultCardPicker", key: "target", label: t("actionCard.field.target") }],
  run: async (_ctx, _pageCard, jobParams) => {
    const cardId = requireStr(jobParams, "target");
    await api.freezeCard(cardId);
    notifySaved(cardId);
  },
});

actionJobRegistry.register({
  id: "addTag",
  label: () => t("actionCard.job.addTag"),
  fields: [
    { kind: "vaultCardPicker", key: "target", label: t("actionCard.field.target") },
    { kind: "text", key: "tag", label: t("actionCard.field.tag") },
  ],
  run: async (_ctx, _pageCard, jobParams) => {
    const cardId = requireStr(jobParams, "target");
    const tag = str(jobParams, "tag").trim();
    if (!tag) throw new Error(t("actionCard.error.missingField"));
    const card = await ensureCardLoaded(cardId);
    const tags = card.metadata.tags ?? [];
    if (!tags.includes(tag)) {
      editCard(cardId, { metadata: { ...card.metadata, tags: [...tags, tag] } });
    }
    notifySaved(cardId);
  },
});

actionJobRegistry.register({
  id: "setProperty",
  label: () => t("actionCard.job.setProperty"),
  fields: [
    { kind: "vaultCardPicker", key: "target", label: t("actionCard.field.target") },
    { kind: "text", key: "propertyKey", label: t("actionCard.field.propertyKey") },
    { kind: "text", key: "propertyValue", label: t("actionCard.field.propertyValue") },
  ],
  run: async (_ctx, _pageCard, jobParams) => {
    const cardId = requireStr(jobParams, "target");
    const key = str(jobParams, "propertyKey").trim();
    if (!key) throw new Error(t("actionCard.error.missingField"));
    const value = str(jobParams, "propertyValue");
    const card = await ensureCardLoaded(cardId);
    const properties = card.metadata.properties ?? [];
    const index = properties.findIndex((p) => p.key === key);
    const next =
      index >= 0
        ? properties.map((p, i) => (i === index ? { ...p, value, linkedCardId: null } : p))
        : [...properties, { key, value, linkedCardId: null }];
    editCard(cardId, { metadata: { ...card.metadata, properties: next } });
    notifySaved(cardId);
  },
});

actionJobRegistry.register({
  id: "setInputValue",
  label: () => t("actionCard.job.setInputValue"),
  fields: [
    { kind: "vaultCardPicker", key: "target", label: t("actionCard.field.target") },
    { kind: "text", key: "value", label: t("actionCard.field.value") },
  ],
  // Comma-separated so this one field covers both single- and multi-value kinds —
  // see cardMetadata.ts's own `input` field doc comment for why `value` is always
  // an array. Doesn't validate against the target's own `options` (same "fail
  // visibly but don't block the rest of the run" spirit used elsewhere in this
  // file) — an unrecognized value just won't match anything in InputView.tsx.
  run: async (_ctx, _pageCard, jobParams) => {
    const cardId = requireStr(jobParams, "target");
    const value = str(jobParams, "value")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const card = await ensureCardLoaded(cardId);
    const input = card.metadata.input ?? { kind: "text" as const, options: [], value: [] };
    editCard(cardId, { metadata: { ...card.metadata, input: { ...input, value } } });
    notifySaved(cardId);
  },
});

actionJobRegistry.register({
  id: "annotateCard",
  label: () => t("actionCard.job.annotateCard"),
  fields: [
    { kind: "vaultCardPicker", key: "target", label: t("actionCard.field.target") },
    {
      kind: "select",
      key: "process",
      label: t("actionCard.field.process"),
      options: [
        { value: "diff", label: t("actionCard.annotateCard.diff") },
        { value: "footnote", label: t("actionCard.annotateCard.footnote") },
        { value: "highlight", label: t("actionCard.annotateCard.highlight") },
      ],
    },
    { kind: "text", key: "instruction", label: t("actionCard.field.instruction") },
  ],
  // No `selection` — always runs against the target's whole current content, same
  // as the Dock's own whole-Card Rewrite (App.tsx's handleRewriteSelected); a
  // selection-scoped run only exists from the text-selection context menu, which
  // has no analog here (there's no text to have selected). `instruction` is only
  // meaningful for "diff" (annotationService.ts's own per-process prompts) but is
  // harmless to send for the other two.
  run: async (_ctx, _pageCard, jobParams) => {
    const cardId = requireStr(jobParams, "target");
    const process = (str(jobParams, "process") || "diff") as AnnotationProcess;
    await api.runAnnotationProcess(process, cardId, undefined, undefined, str(jobParams, "instruction") || undefined);
    notifySaved(cardId);
  },
});

actionJobRegistry.register({
  id: "openUrl",
  label: () => t("actionCard.job.openUrl"),
  fields: [{ kind: "text", key: "url", label: t("actionCard.field.url"), placeholder: "https://example.com" }],
  run: async (_ctx, _pageCard, jobParams) => {
    const url = str(jobParams, "url").trim();
    if (!url) throw new Error(t("actionCard.error.missingField"));
    window.open(url, "_blank", "noopener,noreferrer");
  },
});

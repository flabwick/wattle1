import type { PageCardWithCard } from "@wattle/shared";
import { actionJobRegistry, resolveJobParams, type ActionJobContext, type StepOutput } from "./actionJobRegistry.js";
// Side-effect only — registers "generateSteps" into the actionJobRegistry
// singleton above. Its own module can't be one of actionJobRegistry.ts's own
// registrations (circular import — see actionScriptJob.ts's own doc comment), so
// it's pulled in here instead, before ACTION_JOBS below is computed.
import "./actionScriptJob.js";
// Same side-effect-registration reason as actionScriptJob.ts above — see
// wattleJsJob.ts's own doc comment on its "setJsCard" job.
import "./wattleJsJob.js";

export type {
  ActionJobContext,
  PromptCardContextMode,
  ActionFieldSpec,
  ActionJobDefinition,
  StepOutput,
} from "./actionJobRegistry.js";
export { actionJobRegistry } from "./actionJobRegistry.js";

/** Every registered job, for a plain job-kind `<select>` — see ActionJobFields.tsx. */
export const ACTION_JOBS: ReadonlyArray<{ id: string; label: () => string }> = actionJobRegistry.list();

export function isKnownActionJob(jobId: string | undefined): jobId is string {
  return jobId !== undefined && actionJobRegistry.has(jobId);
}

/**
 * Dispatches a stored jobId/jobParams to whichever registry entry (actionJobRegistry.ts)
 * matches — the one place both an inline actionButton node (ActionButtonNodeView.tsx,
 * fire-and-forget, single job) and the "action" CardType's own multi-step Run
 * (ActionCardView.tsx, awaited in a loop so it can stop at the first failure) call
 * through. Rejects for an unrecognized jobId rather than silently no-op-ing, so a
 * multi-step run's own try/catch can report *which* step failed and why — the button
 * that calls this without awaiting (ActionButtonNodeView.tsx) already disables itself
 * for an unrecognized jobId (see isKnownActionJob above), so reaching here with one
 * would already be a bug elsewhere, not a case to swallow silently.
 *
 * Resolves any `{{name}}` variable tokens in `jobParams` against `pageCard`'s own
 * `metadata.properties` before dispatching (resolveJobParams, actionJobRegistry.ts)
 * — every job's own `run()` only ever sees plain, already-resolved strings.
 */
export async function runActionJob(
  pageCard: PageCardWithCard,
  jobId: string | undefined,
  jobParams: Record<string, unknown> | undefined,
  ctx: ActionJobContext,
): Promise<StepOutput | void> {
  const job = jobId ? actionJobRegistry.get(jobId) : undefined;
  if (!job) return;
  const resolvedParams = resolveJobParams(jobParams ?? {}, pageCard.card.metadata.properties ?? []);
  return await job.run(ctx, pageCard, resolvedParams);
}

import type { PageCardWithCard } from "@wattle/shared";
import { t } from "../i18n/index.js";

/**
 * The small, fixed, explicitly-allowed set of jobs an inline actionButton node
 * (richText/actionButtonNode.ts) can trigger (Apps feature spec §3) — never an
 * open door into arbitrary operations. Each entry maps straight to an existing
 * client-side function already performing that action (see ActionJobContext
 * below); there is deliberately no generic "run any operation" path here.
 */
export type ActionJobId =
  | "createCard"
  | "promptCard"
  | "openApp"
  | "newBlankPage"
  | "newBlankTab"
  | "navigatePage"
  | "removeCard"
  | "saveCard";

export const ACTION_JOBS: ReadonlyArray<{ id: ActionJobId; label: () => string }> = [
  { id: "createCard", label: () => t("actionCard.job.createCard") },
  { id: "promptCard", label: () => t("actionCard.job.promptCard") },
  { id: "openApp", label: () => t("actionCard.job.openApp") },
  { id: "newBlankPage", label: () => t("actionCard.job.newBlankPage") },
  { id: "newBlankTab", label: () => t("actionCard.job.newBlankTab") },
  { id: "navigatePage", label: () => t("actionCard.job.navigatePage") },
  { id: "removeCard", label: () => t("actionCard.job.removeCard") },
  { id: "saveCard", label: () => t("actionCard.job.saveCard") },
];

export function isKnownActionJob(jobId: string | undefined): jobId is ActionJobId {
  return ACTION_JOBS.some((job) => job.id === jobId);
}

/** A Prompt Card's context mode (Apps feature follow-up): "context" is the normal
 *  Generation Rule (everything above, same as any other generation); "own" skips it
 *  entirely, so the model sees only the configured instructions (plus whatever any
 *  embedded card-link placeholders inside them resolve to — see generationService.ts's
 *  resolveInstructionEmbeds). */
export type PromptCardContextMode = "context" | "own";

export interface ActionJobContext {
  /** `createCard`'s params: blank if `title`/`content` are both empty, same as the
   *  Feed Input Button's own "+". `content` may contain a `<wattle-embed
   *  data-card-id="...">` reference (inserted via ActionButtonConfigPopover's own
   *  link picker), pointing at a hidden Card or any other Card — rendered as a
   *  normal embed like any note's. */
  onCreateCard: (pageCard: PageCardWithCard, title: string, content: string) => void;
  /** Opens an App — a brand-new Tab (scope "tab") or a new Page in the current Tab
   *  (scope "page"), same as the App browser's own Open action. This is also what
   *  covers "open a page/tab pre-populated with cards" — an App's snapshot already
   *  *is* exactly that; there's no separate job for it. */
  onOpenApp: (appId: string) => void;
  /** Triggers a generation anchored at this button's own position (ghost card
   *  streams in immediately below it, then auto-saves on completion, same as every
   *  other generation in the app today). */
  onPromptCard: (pageCard: PageCardWithCard, instructions: string, contextMode: PromptCardContextMode) => void;
  /** A brand-new blank Page in the current Tab — same placement/navigation as the
   *  Dock's own page-nav "+". */
  onNewBlankPage: () => void;
  /** A brand-new Tab with one blank Page, navigated to immediately — unlike the
   *  Tabs panel's own "+" (which creates a Tab but stays put), this job's whole
   *  point is "go there", so it navigates as part of the same action. */
  onNewBlankTab: () => void;
  /** Same as the Dock's page-nav up/down arrows — a no-op at either end of the
   *  stack, same as those arrows being disabled there. */
  onNavigatePage: (direction: "up" | "down") => void;
  /** Removes one specific *other* Card from the current Page (never the Card this
   *  button lives in, never the vault copy) — the safe "Remove", same convention as the
   *  Dock's own Remove action (an unsaved Card is promoted to the vault first, so
   *  removing it from the Page can never silently destroy unsaved work). Silently
   *  does nothing if the target PageCard no longer exists (e.g. already removed) —
   *  same "don't fail the whole thing over a stale reference" convention as
   *  generationService.ts's resolveInstructionEmbeds. */
  onRemoveCard: (targetPageCardId: string) => void;
  /** Commits one specific *other* Card's current draft to the vault — same
   *  operation as the Dock's own Save action, just targeting whichever Card was
   *  configured rather than the current selection. Same stale-reference tolerance
   *  as onRemoveCard. */
  onSaveCard: (targetPageCardId: string) => void;
}

/**
 * Maps a stored jobId to the one existing function that already performs it.
 * Silently does nothing for an unrecognized jobId — the button that calls this is
 * disabled in that case (ActionButtonNodeView.tsx), so reaching here with one would
 * already be a bug elsewhere, not a case to surface an error for.
 */
export function runActionJob(
  pageCard: PageCardWithCard,
  jobId: string | undefined,
  jobParams: Record<string, unknown> | undefined,
  ctx: ActionJobContext,
): void {
  if (jobId === "createCard") {
    const title = typeof jobParams?.title === "string" ? jobParams.title : "";
    const content = typeof jobParams?.content === "string" ? jobParams.content : "";
    ctx.onCreateCard(pageCard, title, content);
    return;
  }
  if (jobId === "promptCard") {
    const instructions = typeof jobParams?.instructions === "string" ? jobParams.instructions : "";
    const contextMode: PromptCardContextMode = jobParams?.contextMode === "own" ? "own" : "context";
    ctx.onPromptCard(pageCard, instructions, contextMode);
    return;
  }
  if (jobId === "openApp") {
    const appId = typeof jobParams?.appId === "string" ? jobParams.appId : undefined;
    if (appId) ctx.onOpenApp(appId);
    return;
  }
  if (jobId === "newBlankPage") {
    ctx.onNewBlankPage();
    return;
  }
  if (jobId === "newBlankTab") {
    ctx.onNewBlankTab();
    return;
  }
  if (jobId === "navigatePage") {
    const direction = jobParams?.direction === "up" ? "up" : "down";
    ctx.onNavigatePage(direction);
    return;
  }
  if (jobId === "removeCard") {
    const targetPageCardId = typeof jobParams?.targetPageCardId === "string" ? jobParams.targetPageCardId : undefined;
    if (targetPageCardId) ctx.onRemoveCard(targetPageCardId);
    return;
  }
  if (jobId === "saveCard") {
    const targetPageCardId = typeof jobParams?.targetPageCardId === "string" ? jobParams.targetPageCardId : undefined;
    if (targetPageCardId) ctx.onSaveCard(targetPageCardId);
  }
}

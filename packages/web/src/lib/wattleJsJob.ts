import * as api from "../api/client.js";
import { editCard, ensureCardLoaded, notifySaved } from "./cardStore.js";
import { actionJobRegistry, requireStr } from "./actionJobRegistry.js";
import { validateWattleJsSource } from "./wattleJsValidate.js";
import { t } from "../i18n/index.js";

/** Strips a wrapping markdown code fence if the model added one anyway despite
 *  the "no fence" instruction (prompts/wattle-js/system.md) — cheap insurance
 *  since leaving one in would break `new Function(...)` inside the sandbox
 *  outright rather than just looking untidy. */
function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[a-zA-Z]*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
}

/** Calls the model and returns the cleaned-up script text — JsCardEditor.tsx's
 *  own "Describe what this card should do" applies the result directly via
 *  `editCard`, same as any other hand-edit to `metadata.js.source`. */
export async function generateJsCardSource(instruction: string, currentScript?: string): Promise<string> {
  const { text } = await api.generateWattleJs(instruction, currentScript);
  return stripFence(text);
}

/**
 * Registered here rather than in actionJobRegistry.ts itself — same
 * circular-import reason actionScriptJob.ts's own "generateSteps" job is (this
 * job's own `run()` needs an api call this file already makes; keeping every
 * "calls a generation endpoint or does more than a plain api/editCard write"
 * job out of the base registry file is the established convention — see
 * actionScriptJob.ts's own doc comment). Side-effect-imported once from
 * actionJobs.ts.
 *
 * The agent's own tool catalog (agentToolCatalog.ts) is generated straight
 * from this registry, so `setJsCard` is automatically offered to the agent —
 * prefer it over `editCard` whenever the instruction is about changing what a
 * `js` Card's own script does (agent/system.md says so explicitly). Unlike the
 * earlier block-splicing version of this job, there's nothing to find inside
 * `content` any more — a `js` Card's whole `metadata.js.source` IS the script,
 * so this is a plain, direct overwrite.
 */
actionJobRegistry.register({
  id: "setJsCard",
  label: () => t("actionCard.job.setJsCard"),
  fields: [
    { kind: "vaultCardPicker", key: "target", label: t("actionCard.field.target") },
    { kind: "richtext", key: "source", label: t("actionCard.field.jsCardSource") },
  ],
  run: async (_ctx, _pageCard, jobParams) => {
    const cardId = requireStr(jobParams, "target");
    const source = requireStr(jobParams, "source");
    const target = await ensureCardLoaded(cardId);
    if (target.metadata.typeId !== "js") {
      throw new Error(t("actionCard.error.notAJsCard"));
    }
    // Same "never save something that can't parse" rule as every other write
    // point (JsCardEditor.tsx/CardInfoPanel.tsx) — this is the ONE path both
    // the agent's own tool call and the wattle SDK's wattle.editCard(id,
    // {script}) ultimately funnel through, so it's the one place that
    // guarantees neither can ever leave a js Card with unrunnable source.
    const invalidReason = validateWattleJsSource(source);
    if (invalidReason) {
      throw new Error(`Script isn't valid JavaScript: ${invalidReason}`);
    }
    // Preserve any persisted wattle.state — rewriting the script itself
    // shouldn't blow away state a previous run of that same card already
    // asked to keep.
    editCard(cardId, { metadata: { ...target.metadata, js: { source, state: target.metadata.js?.state } } });
    notifySaved(cardId);
  },
});

/**
 * `wattle.state.set(key, value)`'s own write path (wattleSdkHost.ts's own
 * "state.set" RPC case) — a js Card's one explicit, opt-in way to have a
 * specific value survive a reload, since its own local variables never do by
 * design (see cardMetadata.ts's own doc comment on `js.state`). Merges one key
 * into whatever's already persisted rather than replacing the whole state
 * object, so unrelated keys a script set earlier aren't clobbered by a later,
 * unrelated `state.set` call.
 */
actionJobRegistry.register({
  id: "setJsCardState",
  label: () => t("actionCard.job.setJsCardState"),
  fields: [
    { kind: "vaultCardPicker", key: "target", label: t("actionCard.field.target") },
    { kind: "text", key: "key", label: t("actionCard.field.jsCardStateKey") },
    { kind: "richtext", key: "value", label: t("actionCard.field.jsCardStateValue") },
  ],
  run: async (_ctx, _pageCard, jobParams) => {
    const cardId = requireStr(jobParams, "target");
    const key = requireStr(jobParams, "key");
    const target = await ensureCardLoaded(cardId);
    if (target.metadata.typeId !== "js") {
      throw new Error(t("actionCard.error.notAJsCard"));
    }
    const nextState = { ...(target.metadata.js?.state ?? {}), [key]: jobParams.value };
    editCard(cardId, { metadata: { ...target.metadata, js: { source: target.metadata.js?.source ?? "", state: nextState } } });
    notifySaved(cardId);
  },
});

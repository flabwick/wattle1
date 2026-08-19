import * as api from "../api/client.js";
import { editCard, ensureCardLoaded, notifySaved } from "./cardStore.js";
import { actionJobRegistry, requireStr } from "./actionJobRegistry.js";
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
    editCard(cardId, { metadata: { ...target.metadata, js: { source } } });
    notifySaved(cardId);
  },
});

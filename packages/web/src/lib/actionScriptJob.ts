import * as api from "../api/client.js";
import { editCard, ensureCardLoaded, notifySaved } from "./cardStore.js";
import { actionJobRegistry, requireStr } from "./actionJobRegistry.js";
import { parseActionScript, serializeActionScript } from "./actionScript.js";
import { buildActionScriptActionsDoc } from "./actionScriptPrompt.js";
import { t } from "../i18n/index.js";

/**
 * Registers "generateSteps" into the shared actionJobRegistry singleton from its
 * own module — not inside actionJobRegistry.ts itself — because this job's own
 * `run()` needs actionScript.ts/actionScriptPrompt.ts, and *those* both need
 * actionJobRegistry.ts back (the job list/field specs the system prompt documents,
 * and the field-kind lookups the parser needs) — putting this job's registration
 * in actionJobRegistry.ts directly would be a circular import. Same "definitions
 * register themselves into a shared singleton" shape @wattle/shared's own
 * cardTypeRegistry uses (registries/definitions/*.ts, not cardType.ts itself).
 * Side-effect-imported once from actionJobs.ts so it's always registered by the
 * time anything calls actionJobRegistry.list()/get("generateSteps").
 *
 * "Generate steps with AI" — the other half of this (CardInfoPanel.tsx's own
 * instruction box) calls the exact same underlying logic directly rather than
 * going through this job, so a human can use it without first building a step
 * that targets itself. This job exists so the SAME capability is also reachable
 * *from inside a script* — an action can regenerate another action's steps (or,
 * targeting itself via a self-reference once actually running, its own).
 */
actionJobRegistry.register({
  id: "generateSteps",
  label: () => t("actionCard.job.generateSteps"),
  fields: [
    { kind: "vaultCardPicker", key: "target", label: t("actionCard.field.target") },
    { kind: "text", key: "instruction", label: t("actionCard.field.instruction") },
  ],
  run: async (_ctx, _pageCard, jobParams) => {
    const cardId = requireStr(jobParams, "target");
    const instruction = requireStr(jobParams, "instruction");
    await runGenerateSteps(cardId, instruction);
  },
});

/** The actual work — shared by the "generateSteps" job above and
 *  CardInfoPanel.tsx's own "Generate with AI" button, so there's exactly one
 *  implementation of "call the model, parse the result, write the steps". */
export async function runGenerateSteps(cardId: string, instruction: string): Promise<void> {
  const target = await ensureCardLoaded(cardId);
  if (target.metadata.typeId !== "action") {
    throw new Error(t("actionCard.error.notAnAction"));
  }
  const action = target.metadata.action ?? { label: "", steps: [] };
  const currentScript = serializeActionScript(action.label, action.steps);
  const actionsDoc = buildActionScriptActionsDoc();

  const { text } = await api.generateActionScript(actionsDoc, instruction, currentScript);
  const result = await parseActionScript(text, async (title) => {
    const page = await api.resolvePageByTitle(title);
    return { id: page.id, title: page.title };
  });
  if (result.errors.length > 0) {
    throw new Error(result.errors.join("; "));
  }

  editCard(cardId, {
    metadata: {
      ...target.metadata,
      action: { label: result.label || action.label, steps: result.steps },
    },
  });
  notifySaved(cardId);
}

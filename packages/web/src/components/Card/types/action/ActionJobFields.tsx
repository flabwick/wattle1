import { useEffect, useState } from "react";
import type { App, PageCardWithCard } from "@wattle/shared";
import { InputField } from "../../../primitives/index.js";
import { EmbeddableTextField } from "./EmbeddableTextField.js";
import { ACTION_JOBS, type PromptCardContextMode } from "../../../../lib/actionJobs.js";
import { listApps } from "../../../../api/client.js";
import { t } from "../../../../i18n/index.js";

interface ActionJobFieldsProps {
  /** Scopes EmbeddableTextField's own annotation/ancestor bookkeeping — the owning
   *  note Card's id (an inline actionButton, ActionButtonConfigPopover.tsx).
   *  Configuration content itself isn't annotatable; this only exists because
   *  CardRichText requires it. */
  cardIdForEmbeds: string;
  jobId: string;
  onJobIdChange: (id: string) => void;
  jobParams: Record<string, unknown>;
  onJobParamsChange: (params: Record<string, unknown>) => void;
  /** Every PageCard on the same Page — for removeCard/saveCard's "pick a card on
   *  this page" selector. */
  pageSiblings: PageCardWithCard[];
  /** Filtered out of that selector — removeCard/saveCard only ever target a
   *  specific *other* card, never the note Card an actionButton itself lives in. */
  excludePageCardId: string;
}

/**
 * The job-picker and its job-specific fields — everything below the "which job"
 * select — factored out so an inline actionButton node's
 * ActionButtonConfigPopover.tsx doesn't duplicate eight jobs' worth of field logic
 * inline. Fully controlled: every value comes from `jobParams`/`jobId`, and every
 * change goes back out through `onJobParamsChange`/`onJobIdChange` — no internal
 * state of its own, so the caller persists however fits its own storage (a node's
 * own attrs).
 */
export function ActionJobFields({
  cardIdForEmbeds,
  jobId,
  onJobIdChange,
  jobParams,
  onJobParamsChange,
  pageSiblings,
  excludePageCardId,
}: ActionJobFieldsProps) {
  const [apps, setApps] = useState<App[]>([]);

  useEffect(() => {
    listApps()
      .then(setApps)
      .catch(() => {});
  }, []);

  const title = typeof jobParams.title === "string" ? jobParams.title : "";
  const content = typeof jobParams.content === "string" ? jobParams.content : "";
  const instructions = typeof jobParams.instructions === "string" ? jobParams.instructions : "";
  const contextMode: PromptCardContextMode = jobParams.contextMode === "own" ? "own" : "context";
  const appId = typeof jobParams.appId === "string" ? jobParams.appId : "";
  const direction: "up" | "down" = jobParams.direction === "up" ? "up" : "down";
  const targetPageCardId = typeof jobParams.targetPageCardId === "string" ? jobParams.targetPageCardId : "";
  const otherCardsOnPage = pageSiblings.filter((pc) => pc.id !== excludePageCardId);

  return (
    <>
      <select value={jobId} onChange={(e) => onJobIdChange(e.target.value)}>
        <option value="">{t("actionCard.job.none")}</option>
        {ACTION_JOBS.map((job) => (
          <option key={job.id} value={job.id}>
            {job.label()}
          </option>
        ))}
      </select>

      {jobId === "createCard" && (
        <>
          <InputField
            value={title}
            placeholder={t("actionCard.createCard.titlePlaceholder")}
            onChange={(e) => onJobParamsChange({ title: e.target.value, content })}
          />
          <EmbeddableTextField
            cardId={cardIdForEmbeds}
            label={t("actionCard.createCard.contentLabel")}
            value={content}
            onChange={(next) => onJobParamsChange({ title, content: next })}
            placeholder={t("actionCard.createCard.contentPlaceholder")}
          />
        </>
      )}

      {jobId === "promptCard" && (
        <>
          <EmbeddableTextField
            cardId={cardIdForEmbeds}
            label={t("actionCard.promptCard.instructionsLabel")}
            value={instructions}
            onChange={(next) => onJobParamsChange({ instructions: next, contextMode })}
            placeholder={t("actionCard.promptCard.instructionsPlaceholder")}
          />
          <select
            value={contextMode}
            onChange={(e) => onJobParamsChange({ instructions, contextMode: e.target.value })}
          >
            <option value="context">{t("actionCard.promptCard.contextAbove")}</option>
            <option value="own">{t("actionCard.promptCard.contextOwn")}</option>
          </select>
        </>
      )}

      {jobId === "openApp" && (
        <select value={appId} onChange={(e) => onJobParamsChange({ appId: e.target.value })}>
          <option value="">{t("actionCard.selectApp")}</option>
          {apps.map((app) => (
            <option key={app.id} value={app.id}>
              {app.name}
            </option>
          ))}
        </select>
      )}

      {jobId === "navigatePage" && (
        <select
          value={direction}
          onChange={(e) => onJobParamsChange({ direction: e.target.value === "up" ? "up" : "down" })}
        >
          <option value="up">{t("actionCard.navigatePage.up")}</option>
          <option value="down">{t("actionCard.navigatePage.down")}</option>
        </select>
      )}

      {(jobId === "removeCard" || jobId === "saveCard") && (
        <select value={targetPageCardId} onChange={(e) => onJobParamsChange({ targetPageCardId: e.target.value })}>
          <option value="">{t("actionCard.selectCardOnPage")}</option>
          {otherCardsOnPage.map((pc) => (
            <option key={pc.id} value={pc.id}>
              {pc.card.title || t("common.untitled")}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

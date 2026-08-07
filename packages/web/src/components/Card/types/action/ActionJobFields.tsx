import type { PageCardWithCard } from "@wattle/shared";
import { actionJobRegistry } from "../../../../lib/actionJobRegistry.js";
import { ActionStepFields } from "./ActionStepFields.js";
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
  /** Every PageCard on the same Page — for a "cardPicker" field's own "pick a card
   *  on this page" selector. */
  pageSiblings: PageCardWithCard[];
  /** Filtered out of that selector — a job's own target is always a specific
   *  *other* card, never the note Card an actionButton itself lives in. */
  excludePageCardId: string;
}

/**
 * The job-picker plus the chosen job's own fields — a thin wrapper around the
 * actionJobRegistry.ts vocabulary and ActionStepFields.tsx's generic renderer, so
 * an inline actionButton node's ActionButtonConfigPopover.tsx (the one remaining
 * caller of this — the "action" CardType's own multi-step list, CardInfoPanel.tsx,
 * renders each step's row directly via ActionStepFields since it already has its
 * own job-kind dropdown per step) doesn't need to know the registry exists. Fully
 * controlled: every value comes from `jobParams`/`jobId`, every change goes back
 * out through `onJobParamsChange`/`onJobIdChange`.
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
  const job = actionJobRegistry.get(jobId);

  return (
    <>
      <select className="app-select" value={jobId} onChange={(e) => onJobIdChange(e.target.value)}>
        <option value="">{t("actionCard.job.none")}</option>
        {actionJobRegistry.list().map((j) => (
          <option key={j.id} value={j.id}>
            {j.label()}
          </option>
        ))}
      </select>

      {job && (
        <ActionStepFields
          cardIdForEmbeds={cardIdForEmbeds}
          fields={job.fields}
          jobParams={jobParams}
          onChange={onJobParamsChange}
          pageSiblings={pageSiblings}
          excludePageCardId={excludePageCardId}
        />
      )}
    </>
  );
}

import { InputField } from "../../../primitives/index.js";
import type { CardTypeEditorProps } from "../../../../registries/cardTypeUi.js";
import { useCard } from "../../../../hooks/useCard.js";
import { editCard } from "../../../../lib/cardStore.js";
import { ActionJobFields } from "./ActionJobFields.js";
import { t } from "../../../../i18n/index.js";
import "../../Card.css";
import "./ActionCard.css";

/**
 * The "action" CardType's editor — the label input plus the same ActionJobFields
 * (job picker + job-specific fields) an inline actionButton's
 * ActionButtonConfigPopover.tsx uses, just rendered inline instead of in a
 * popover (there's no anchor button to hang a popover off of — the whole card
 * *is* the thing being calibrated). Writes straight through via cardStore.editCard
 * on every change, same "no draft, no separate Save step" convention Dock Cards
 * and embeds already use, rather than the PageCard draft/onChangeDraft system —
 * there's nothing here a title/content draft model fits.
 */
export function ActionCardEditor({ pageCard, pageSiblings }: CardTypeEditorProps) {
  const { card: liveCard } = useCard(pageCard.card.id);
  const canonicalCard = liveCard ?? pageCard.card;
  const action = canonicalCard.metadata.action ?? { label: "", jobId: null, jobParams: {} };

  function updateAction(patch: Partial<typeof action>) {
    editCard(pageCard.card.id, {
      metadata: { ...canonicalCard.metadata, action: { ...action, ...patch } },
    });
  }

  return (
    <div className="card-shell card-shell--selected action-card-editor">
      <InputField
        className="card__title-input"
        value={action.label}
        placeholder={t("actionCard.labelPlaceholder")}
        autoFocus
        onChange={(e) => updateAction({ label: e.target.value })}
      />
      <ActionJobFields
        cardIdForEmbeds={pageCard.card.id}
        jobId={action.jobId ?? ""}
        onJobIdChange={(id) => updateAction({ jobId: id || null, jobParams: {} })}
        jobParams={action.jobParams}
        onJobParamsChange={(params) => updateAction({ jobParams: params })}
        pageSiblings={pageSiblings ?? []}
        excludePageCardId={pageCard.id}
      />
    </div>
  );
}

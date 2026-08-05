import type { PageCardWithCard } from "@wattle/shared";
import { InputField, PopoverSurface } from "../../primitives/index.js";
import { useDismiss } from "../../../hooks/useDismiss.js";
import { ActionJobFields } from "../types/action/ActionJobFields.js";
import { t } from "../../../i18n/index.js";
import "./ActionNodes.css";

interface ActionButtonConfigPopoverProps {
  label: string;
  jobId: string;
  jobParams: Record<string, unknown>;
  pageSiblings: PageCardWithCard[];
  excludePageCardId: string;
  cardIdForEmbeds: string;
  onChange: (next: { label: string; jobId: string; jobParams: Record<string, unknown> }) => void;
  onClose: () => void;
}

/**
 * An inline actionButton node's own config — label, which fixed job
 * (lib/actionJobs.ts) it triggers, and that job's own parameters, via the shared
 * ActionJobFields.tsx, persisted to this node's own attrs (not a Card's metadata —
 * there's no whole-card "action" CardType any more, this node is the only way to
 * place one of these buttons at all). Opens as a small anchored popover, same
 * outside-click/Escape-to-close convention as CardLinkPicker.tsx/ProcessPicker.tsx.
 * No "show a text input" toggle here: a button reads from whatever actionField
 * nodes already exist in the same Card, if any, rather than owning one itself.
 */
export function ActionButtonConfigPopover({
  label,
  jobId,
  jobParams,
  pageSiblings,
  excludePageCardId,
  cardIdForEmbeds,
  onChange,
  onClose,
}: ActionButtonConfigPopoverProps) {
  const rootRef = useDismiss<HTMLDivElement>(onClose);

  return (
    <PopoverSurface ref={rootRef} className="action-button-popover" onClick={(e) => e.stopPropagation()}>
      <InputField
        value={label}
        placeholder={t("actionCard.labelPlaceholder")}
        autoFocus
        onChange={(e) => onChange({ label: e.target.value, jobId, jobParams })}
      />
      <ActionJobFields
        cardIdForEmbeds={cardIdForEmbeds}
        jobId={jobId}
        onJobIdChange={(id) => onChange({ label, jobId: id, jobParams: {} })}
        jobParams={jobParams}
        onJobParamsChange={(params) => onChange({ label, jobId, jobParams: params })}
        pageSiblings={pageSiblings}
        excludePageCardId={excludePageCardId}
      />
    </PopoverSurface>
  );
}

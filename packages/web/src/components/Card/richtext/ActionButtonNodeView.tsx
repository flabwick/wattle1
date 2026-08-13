import { useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/core";
import { Button } from "../../primitives/index.js";
import { useCardEditingContext } from "./CardEditingContext.js";
import { ActionButtonConfigPopover } from "./ActionButtonConfigPopover.js";
import { ElementControls } from "./ElementControls.js";
import { isKnownActionJob } from "../../../lib/actionJobs.js";
import { t } from "../../../i18n/index.js";
import "./ActionNodes.css";

function parseJobParams(raw: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(typeof raw === "string" ? raw : "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The React NodeView for the `actionButton` node (richText/actionButtonNode.ts) —
 * an inline button embedded in a Card's own rich content, running the fixed job
 * allow-list (lib/actionJobs.ts) via CardEditingContext.onRunActionJob, threaded
 * down from Card.tsx. Behaves differently depending on whether the surrounding card is
 * being edited: while editing, a click opens this button's own config popover
 * instead of running its job (there's nothing useful "running" a half-configured
 * button mid-edit would do); while viewing, a click collects every actionField
 * node's current value in this same Card (in document order) and dispatches.
 */
export function ActionButtonNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const ctx = useCardEditingContext();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const label = (node.attrs.label as string) || t("actionCard.defaultLabel");
  const jobId = (node.attrs.jobId as string | null) ?? "";
  const jobParams = parseJobParams(node.attrs.jobParams);
  const known = isKnownActionJob(jobId || undefined);
  const running = Boolean(ctx.ownerPageCard && ctx.generatingPageCardId === ctx.ownerPageCard.id);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (ctx.editable) {
      setPopoverOpen((open) => !open);
      return;
    }
    if (!known || running || !ctx.ownerPageCard || !ctx.onRunActionJob) return;
    const inputs = ctx.getActionFieldValues?.() ?? [];
    // Fire-and-forget — this button doesn't show per-run failure state (unlike the
    // "action" CardType's own multi-step Run), so a rejected job (e.g. a stale
    // cardPicker target) is swallowed here rather than becoming a console warning.
    Promise.resolve(ctx.onRunActionJob(ctx.ownerPageCard, jobId, { ...jobParams, inputs })).catch(() => {});
  }

  return (
    <NodeViewWrapper className="action-button-node">
      <Button
        variant="primary"
        className="action-button-node__button"
        disabled={!ctx.editable && (!known || running)}
        onClick={handleClick}
      >
        {!ctx.editable && !known ? t("actionCard.unsupported") : !ctx.editable && running ? t("actionCard.running") : label}
      </Button>
      {popoverOpen && ctx.editable && (
        <ActionButtonConfigPopover
          label={label}
          jobId={jobId}
          jobParams={jobParams}
          pageSiblings={ctx.pageSiblings ?? []}
          excludePageCardId={ctx.ownerPageCard?.id ?? ""}
          cardIdForEmbeds={ctx.ownerPageCard?.card.id ?? ""}
          onChange={(next) =>
            updateAttributes({
              label: next.label,
              jobId: next.jobId || null,
              jobParams: JSON.stringify(next.jobParams),
            })
          }
          onClose={() => setPopoverOpen(false)}
        />
      )}
      {ctx.editable && (
        <ElementControls variant="corner" label={t("card.deleteActionButton")} onDelete={() => deleteNode()} />
      )}
    </NodeViewWrapper>
  );
}

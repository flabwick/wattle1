import type { CardTypeEditorProps } from "../../../../registries/cardTypeUi.js";
import { StackBody } from "./StackBody.js";

/** Nothing actually differs between a Stack Card "selected" vs. "selected + editing"
 *  (see StackBody.tsx's doc comment) — this only exists because
 *  cardTypeUiRegistry.register requires an Editor for every type (same reasoning as
 *  FileEditor.tsx). `onChangeDraft` is unused: the container itself has no draft of
 *  its own, only its active member does (staged inside useCardStack.ts instead). */
export function StackEditor({ pageCard }: CardTypeEditorProps) {
  return (
    <div className="card-shell card-shell--selected">
      <StackBody stackCardId={pageCard.card.id} selected />
    </div>
  );
}

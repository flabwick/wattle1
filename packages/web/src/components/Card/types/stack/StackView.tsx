import { CardShell } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { StackBody } from "./StackBody.js";

/** The header bar's own click-to-select (StackBody.tsx) toggles selection of the
 *  Stack Card itself (Dock's Move row — see Dock.tsx's isStackSelected) — in if not
 *  already selected, out again if it was; everything else (Move, Hide) is reached
 *  from the Dock, removing is the header's own "X" (onRemove below). Content
 *  inside (StackBody) is independently, always-editable. `selected` also gates
 *  whether StackBody publishes its active alternate's Save into the Dock
 *  (activeStackRegistry.ts) — only the Stack actually in view there. */
export function StackView({ pageCard, selected, onSelect, onRemove, onSendToDock }: CardTypeViewProps) {
  // Same "reveal hidden Cards" toggle Card.tsx's own "note" branch honors — shown
  // only while PageStack.tsx's revealHidden is on (see PageCardSlot), so this class
  // is always the "still hidden" indicator, never a false positive.
  const isHidden = Boolean(pageCard.card.metadata.hidden);
  return (
    <CardShell selected={selected} className={isHidden ? "card-shell--hidden" : undefined}>
      <StackBody
        stackCardId={pageCard.card.id}
        selected={selected}
        onSelect={onSelect}
        onRemove={onRemove && (() => onRemove(pageCard.id))}
        onSendToDock={onSendToDock && (() => onSendToDock(pageCard.id))}
      />
    </CardShell>
  );
}

import { CardShell } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import { StackBody } from "./StackBody.js";

/** A tap toggles selection of the Stack Card itself (Dock's Move row — see
 *  Dock.tsx's isStackSelected) — in if not already selected, out again if it was;
 *  everything else (Save, Move, Hide, remove) is reached from the Dock. Content
 *  inside (StackBody) is independently, always-editable. `selected` also gates
 *  whether StackBody publishes its active alternate's Save into the Dock
 *  (activeStackRegistry.ts) — only the Stack actually in view there. */
export function StackView({ pageCard, selected, onSelect, onOpenFullscreen }: CardTypeViewProps) {
  return (
    <CardShell selected={selected} onClick={onSelect}>
      <StackBody
        stackCardId={pageCard.card.id}
        selected={selected}
        onOpenFullscreen={onOpenFullscreen && (() => onOpenFullscreen(pageCard.id))}
      />
    </CardShell>
  );
}

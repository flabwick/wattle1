import { CardShell } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";

/**
 * Placeholder render for the "link" CardType — proves cardTypeUiRegistry can resolve
 * more than one type (see the C0 doc). Nothing creates a "link" Card yet, so this
 * never actually renders in the app today.
 */
export function LinkView({ selected, onSelect, onRequestEdit }: CardTypeViewProps) {
  return (
    <CardShell selected={selected} onClick={onSelect} onDoubleClick={onRequestEdit}>
      <p className="card__preview">Link card — not yet implemented</p>
    </CardShell>
  );
}

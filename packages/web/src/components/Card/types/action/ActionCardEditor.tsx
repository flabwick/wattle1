import { InputField } from "../../../primitives/index.js";
import type { CardTypeEditorProps } from "../../../../registries/cardTypeUi.js";
import "../../Card.css";

/**
 * Action Cards have no inline editor any more — configuration (label, steps, their
 * own parameters) lives entirely on the card's own flip/info panel now
 * (CardInfoPanel.tsx's "Actions" section, ActionCardView.tsx's own doc comment).
 * Nothing in the app puts an "action" Card into editing state (there's no gear
 * button any more to trigger it), but cardTypeUiRegistry.register requires an
 * Editor for every type — same fallback precedent as FileEditor.tsx.
 */
export function ActionCardEditor({ pageCard }: CardTypeEditorProps) {
  return (
    <div className="card-shell card-shell--selected">
      <InputField className="card__title-input" value={pageCard.card.title} readOnly />
    </div>
  );
}

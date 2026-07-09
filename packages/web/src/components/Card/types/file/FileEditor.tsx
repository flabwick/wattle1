import { InputField } from "../../../primitives/index.js";
import type { CardTypeEditorProps } from "../../../../registries/cardTypeUi.js";
import "../../Card.css";

/**
 * File Cards have no editor — nothing in the app ever puts one into editing state
 * (see FileView.tsx), but cardTypeUiRegistry.register requires an Editor for every
 * type, so this just renders the same read-only textbox as a fallback.
 */
export function FileEditor({ pageCard }: CardTypeEditorProps) {
  return (
    <div className="card-shell card-shell--selected">
      <InputField className="card__title-input" value={pageCard.card.title} readOnly />
    </div>
  );
}

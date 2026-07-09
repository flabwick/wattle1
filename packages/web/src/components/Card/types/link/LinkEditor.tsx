import type { CardTypeEditorProps } from "../../../../registries/cardTypeUi.js";

/** Placeholder editor for the "link" CardType — see LinkView.tsx. */
export function LinkEditor(_props: CardTypeEditorProps) {
  return (
    <div className="card-shell card-shell--editing card-shell--selected">
      <p className="card__preview">Link card editor — not yet implemented</p>
    </div>
  );
}

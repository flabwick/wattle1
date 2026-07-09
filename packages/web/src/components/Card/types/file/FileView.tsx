import { CardShell, InputField } from "../../../primitives/index.js";
import type { CardTypeViewProps } from "../../../../registries/cardTypeUi.js";
import "../../Card.css";

/**
 * The "file" CardType's (only) render — a read-only textbox showing the uploaded
 * filename, nothing else. No onDoubleClick wired to onRequestEdit: file Cards have no
 * editor (see fileCardType.ts — "card.edit" isn't in supportsOperations), so there's
 * nothing for a double-click/long-press to open.
 */
export function FileView({ pageCard, selected, onSelect }: CardTypeViewProps) {
  return (
    <CardShell selected={selected} onClick={onSelect}>
      <InputField className="card__title-input" value={pageCard.card.title} readOnly />
    </CardShell>
  );
}

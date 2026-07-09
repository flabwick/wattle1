import { Icon } from "../../../primitives/index.js";
import type { CardTypePickerTileProps } from "../../../../registries/cardTypeUi.js";

/**
 * Stub tile for a future "choose a CardType" picker — no picker exists yet (see the
 * C0 doc), so nothing renders this today.
 */
export function NotePickerTile({ onSelect }: CardTypePickerTileProps) {
  return (
    <button type="button" className="card-type-picker-tile" onClick={onSelect}>
      <Icon name="file" />
      <span>Note</span>
    </button>
  );
}

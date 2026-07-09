import { Icon } from "../../../primitives/index.js";
import type { CardTypePickerTileProps } from "../../../../registries/cardTypeUi.js";

/** Stub tile for a future "choose a CardType" picker — see NotePickerTile.tsx. */
export function LinkPickerTile({ onSelect }: CardTypePickerTileProps) {
  return (
    <button type="button" className="card-type-picker-tile" onClick={onSelect}>
      <Icon name="file" />
      <span>Link</span>
    </button>
  );
}

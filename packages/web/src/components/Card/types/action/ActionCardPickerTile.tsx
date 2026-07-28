import { Icon } from "../../../primitives/index.js";
import type { CardTypePickerTileProps } from "../../../../registries/cardTypeUi.js";
import { t } from "../../../../i18n/index.js";

/** Stub tile for a future "choose a CardType" picker — see NotePickerTile.tsx. */
export function ActionCardPickerTile({ onSelect }: CardTypePickerTileProps) {
  return (
    <button type="button" className="card-type-picker-tile" onClick={onSelect}>
      <Icon name="insertButton" />
      <span>{t("actionCard.pickerTileLabel")}</span>
    </button>
  );
}

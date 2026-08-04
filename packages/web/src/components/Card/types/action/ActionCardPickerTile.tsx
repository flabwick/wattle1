import { Icon } from "../../../primitives/index.js";
import type { CardTypePickerTileProps } from "../../../../registries/cardTypeUi.js";
import { t } from "../../../../i18n/index.js";

/** The Feed Input Button's type-picker "Action" option (FeedInputButton.tsx). */
export function ActionCardPickerTile({ onSelect }: CardTypePickerTileProps) {
  return (
    <button type="button" className="card-type-picker-tile" onClick={onSelect}>
      <Icon name="insertButton" />
      <span>{t("actionCard.pickerTileLabel")}</span>
    </button>
  );
}

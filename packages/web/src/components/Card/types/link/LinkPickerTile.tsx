import { Icon } from "../../../primitives/index.js";
import type { CardTypePickerTileProps } from "../../../../registries/cardTypeUi.js";
import { t } from "../../../../i18n/index.js";

/** The Feed Input Button's type-picker "Link" option (FeedInputButton.tsx). */
export function LinkPickerTile({ onSelect }: CardTypePickerTileProps) {
  return (
    <button type="button" className="card-type-picker-tile" onClick={onSelect}>
      <Icon name="externalLink" />
      <span>{t("linkCard.pickerTileLabel")}</span>
    </button>
  );
}

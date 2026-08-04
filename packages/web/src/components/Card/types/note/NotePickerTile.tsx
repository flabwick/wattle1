import { Icon } from "../../../primitives/index.js";
import type { CardTypePickerTileProps } from "../../../../registries/cardTypeUi.js";
import { t } from "../../../../i18n/index.js";

/** The Feed Input Button's type-picker "Blank Card" option (FeedInputButton.tsx) —
 *  a plain "note"-typed Card with nothing in it yet. */
export function NotePickerTile({ onSelect }: CardTypePickerTileProps) {
  return (
    <button type="button" className="card-type-picker-tile" onClick={onSelect}>
      <Icon name="file" />
      <span>{t("feedInput.blankCard")}</span>
    </button>
  );
}

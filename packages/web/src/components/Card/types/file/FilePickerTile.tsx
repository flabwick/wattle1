import { Icon } from "../../../primitives/index.js";
import type { CardTypePickerTileProps } from "../../../../registries/cardTypeUi.js";

/** The Feed Input Button's type-picker "File" option — triggers the same upload
 *  dialog the utility row's own Upload used to, rather than creating a blank
 *  file-typed Card (there's nothing sensible to show without real uploaded bytes). */
export function FilePickerTile({ onSelect }: CardTypePickerTileProps) {
  return (
    <button type="button" className="card-type-picker-tile" onClick={onSelect}>
      <Icon name="upload" />
      <span>Upload</span>
    </button>
  );
}

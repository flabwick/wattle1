import { Icon } from "../../../primitives/index.js";
import type { CardTypePickerTileProps } from "../../../../registries/cardTypeUi.js";

/** The Feed Input Button's type-picker "Stack" option — its onSelect is
 *  handleAddStackToCurrentPage (App.tsx), since creating a Stack needs its own
 *  endpoint (stackService.createStackInPage) rather than plain addNewCardToPage. */
export function StackPickerTile({ onSelect }: CardTypePickerTileProps) {
  return (
    <button type="button" className="card-type-picker-tile" onClick={onSelect}>
      <Icon name="tabs" />
      <span>Stack</span>
    </button>
  );
}

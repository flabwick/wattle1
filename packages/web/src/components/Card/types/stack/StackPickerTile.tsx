import { Icon } from "../../../primitives/index.js";
import type { CardTypePickerTileProps } from "../../../../registries/cardTypeUi.js";

/** Stub tile for a future "choose a CardType" picker — see NotePickerTile.tsx. The
 *  Feed Input Button's own type picker (FeedInputButton.tsx) special-cases "stack"
 *  directly rather than going through this tile today (creating a Stack needs a
 *  dedicated endpoint, stackService.createStackInPage, not the plain addNewCardToPage
 *  every other type still stubs out to). */
export function StackPickerTile({ onSelect }: CardTypePickerTileProps) {
  return (
    <button type="button" className="card-type-picker-tile" onClick={onSelect}>
      <Icon name="tabs" />
      <span>Stack</span>
    </button>
  );
}

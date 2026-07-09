import { cardTypeUiRegistry } from "./cardTypeUi.js";
import { NoteView } from "../components/Card/types/note/NoteView.js";
import { NoteEditor } from "../components/Card/types/note/NoteEditor.js";
import { NotePickerTile } from "../components/Card/types/note/NotePickerTile.js";
import { LinkView } from "../components/Card/types/link/LinkView.js";
import { LinkEditor } from "../components/Card/types/link/LinkEditor.js";
import { LinkPickerTile } from "../components/Card/types/link/LinkPickerTile.js";
import { FileView } from "../components/Card/types/file/FileView.js";
import { FileEditor } from "../components/Card/types/file/FileEditor.js";
import { FilePickerTile } from "../components/Card/types/file/FilePickerTile.js";

let initialized = false;

/**
 * Registers the UI (View/Editor/PickerTile) for every CardType. Mirrors initCardTypes
 * in @wattle/shared — see cardTypeUi.ts for why this is a separate registry. Call once
 * at app startup (see main.tsx via initRegistries). Safe to call more than once.
 */
export function initCardTypeUi(): void {
  if (initialized) return;
  cardTypeUiRegistry.register({
    typeId: "note",
    View: NoteView,
    Editor: NoteEditor,
    PickerTile: NotePickerTile,
  });
  cardTypeUiRegistry.register({
    typeId: "link",
    View: LinkView,
    Editor: LinkEditor,
    PickerTile: LinkPickerTile,
  });
  cardTypeUiRegistry.register({
    typeId: "file",
    View: FileView,
    Editor: FileEditor,
    PickerTile: FilePickerTile,
  });
  initialized = true;
}

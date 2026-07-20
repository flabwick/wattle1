import { useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";

/** Which CardRichText instance was most recently focused — a small external store,
 *  not context/prop plumbing, because the Dock (the WYSIWYG toolbar's home — see
 *  Dock.tsx) is a sibling of wherever the active editor actually lives in the tree
 *  (Card/CardEmbed/DockCardsPanel), not an ancestor, so there's no natural prop path
 *  down to it. Deliberately never cleared on blur — clicking a Dock button inherently
 *  blurs the editor first, and the toolbar still needs that same instance as its
 *  target when the click lands a moment later. Only cleared explicitly, when the
 *  editor that was active unmounts (CardRichText.tsx). */
let activeEditor: Editor | null = null;
/** Whether `activeEditor` is *currently* focused, not just last-focused — unlike
 *  `activeEditor` itself, this DOES flip false on blur (CardRichText.tsx's onBlur).
 *  Needed because a Card's title field is a plain `<input>`, not part of the TipTap
 *  document — focusing it blurs the editor without changing `activeEditor`, and the
 *  Dock's formatting row (Dock.tsx) should disappear while that title field, not the
 *  rich-text body, has focus. A formatting button's own onMouseDown preventDefault
 *  keeps this true across the click, same as it keeps `activeEditor` targeting the
 *  right instance. */
let activeEditorFocused = false;
const listeners = new Set<() => void>();

export function setActiveEditor(editor: Editor | null): void {
  activeEditor = editor;
  listeners.forEach((listener) => listener());
}

export function setActiveEditorFocused(focused: boolean): void {
  activeEditorFocused = focused;
  listeners.forEach((listener) => listener());
}

export function getActiveEditor(): Editor | null {
  return activeEditor;
}

export function getActiveEditorFocused(): boolean {
  return activeEditorFocused;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActiveEditor(): Editor | null {
  return useSyncExternalStore(subscribe, getActiveEditor);
}

export function useActiveEditorFocused(): boolean {
  return useSyncExternalStore(subscribe, getActiveEditorFocused);
}

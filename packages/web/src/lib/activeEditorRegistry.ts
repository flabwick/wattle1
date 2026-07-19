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
const listeners = new Set<() => void>();

export function setActiveEditor(editor: Editor | null): void {
  activeEditor = editor;
  listeners.forEach((listener) => listener());
}

export function getActiveEditor(): Editor | null {
  return activeEditor;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActiveEditor(): Editor | null {
  return useSyncExternalStore(subscribe, getActiveEditor);
}

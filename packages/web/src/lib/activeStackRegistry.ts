import { useSyncExternalStore } from "react";

/** What the Dock needs to act on the currently-selected Stack's active alternate —
 *  published by StackBody.tsx while its container is selected, same "child publishes
 *  to a small external store, Dock reads it" shape as activeEditorRegistry.ts (the
 *  Dock is a sibling of wherever a Stack actually lives in the tree, not an
 *  ancestor, so there's no plain prop path down to it). Null whenever no Stack is
 *  selected — same convention as no formatting toolbar showing without an editor. */
export interface ActiveStackControls {
  /** The Stack container's own Card id — lets a cleanup effect check "is this still
   *  my registration" before clearing (same guard CardRichText.tsx's unmount uses
   *  against activeEditorRegistry.ts), so switching straight from one selected Stack
   *  to another can't have the first's unmount wipe out the second's fresh one. */
  stackCardId: string;
  hasUnsavedDraft: boolean;
  save: () => void;
  remove: () => void;
  /** True while a generation is streaming into this Stack's active alternate
   *  (StackBody.tsx's own useGeneration() instance) — lets the Dock's Generate
   *  action show the same Stop/spinner state a page-level generation gets. */
  isGenerating: boolean;
  /** The Dock's "Generate" action for a selected Stack (Dock.tsx's isStackSelected
   *  row): appends a new blank alternate and immediately starts generating into it
   *  — always a *new* branch, never overwriting whatever's currently active. */
  generateNewAlternate: () => void;
  stopGenerating: () => void;
}

let activeStack: ActiveStackControls | null = null;
const listeners = new Set<() => void>();

export function setActiveStackControls(controls: ActiveStackControls | null): void {
  activeStack = controls;
  listeners.forEach((listener) => listener());
}

export function getActiveStackControls(): ActiveStackControls | null {
  return activeStack;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useActiveStackControls(): ActiveStackControls | null {
  return useSyncExternalStore(subscribe, getActiveStackControls);
}

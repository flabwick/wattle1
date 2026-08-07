/** Lets the Dock's text-selection quick-lookup row (Dock.tsx's showLookupRow) add its
 *  result to the current Page or Dock without a prop threaded down to it — same
 *  "sibling publishes to a small external store" shape as
 *  activeEditorRegistry.ts/activeStackRegistry.ts, but simpler: nothing here needs to
 *  be React-reactive (no component re-renders when these change), it's just an
 *  on-demand call App.tsx wires up once. */
export interface QuickAddHandlers {
  /** Appends a new note Card with this HTML content to the bottom of whichever Page
   *  is currently open — blank-title unless `title` is given (e.g. SearchCardBody.tsx's
   *  "export selected results" action, which passes the extracted page's own title).
   *  No-ops if there's no current Page. */
  addToPage: (html: string, title?: string) => void;
  /** Creates a new blank-title note Card with this HTML content directly in the
   *  Dock's persistent scratchpad. */
  addToDock: (html: string) => void;
}

let handlers: QuickAddHandlers | null = null;

export function registerQuickAddHandlers(next: QuickAddHandlers): void {
  handlers = next;
}

export function quickAddToPage(html: string, title?: string): void {
  handlers?.addToPage(html, title);
}

export function quickAddToDock(html: string): void {
  handlers?.addToDock(html);
}

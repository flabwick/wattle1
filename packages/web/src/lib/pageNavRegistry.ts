/** Lets a `pageLink` node (PageLinkNodeView.tsx), anywhere in the document tree — a
 *  top-level Card, a Stack alternate, a Dock Card, an arbitrarily nested embed —
 *  navigate to its target Page without a prop threaded all the way down through
 *  CardRichText/Card.tsx/cardTypeUiRegistry/StackBody/etc. Same "sibling publishes to
 *  a small external store" shape as quickAddRegistry.ts, for the same reason: nothing
 *  here needs to be React-reactive, it's just an on-demand call App.tsx wires up once. */
let handler: ((pageId: string) => void) | null = null;

export function registerPageNavHandler(next: (pageId: string) => void): void {
  handler = next;
}

export function navigateToPageFromRichText(pageId: string): void {
  handler?.(pageId);
}

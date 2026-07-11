# Step 7 — Move Mode

Cards could previously only be repositioned by removing them from a Page and
re-adding them at the bottom of another — no in-place reorder, no cross-page move
with a chosen position. This step adds **Move Mode**: tap a Card, tap Move in the
Dock, then tap a destination.

Scope is deliberately limited to the existing `PageCard` model — reordering within a
Page and moving to a different (existing or brand-new) Page. Embedding a Card inside
another Card via Move is out of scope: today's embeds are `[[cardId]]` text tokens
with no `PageCard`-backed schema at all (a DB `Embed` table was tried and reverted the
same day — see the `20260710081854_add_embed` / `20260710082438_remove_unused_embed_model`
migrations), so supporting that as a Move destination would mean designing a new
schema from scratch, a separate and materially larger effort.

## Backend: one atomic move

`pageCardService.movePageCard(pageCardId, destPageId, destIndex)`
(`packages/api/src/services/pageCardService.ts`) does the whole move in a single
`prisma.$transaction`:

1. If the move crosses Pages, renumber the source Page's remaining `PageCard`s
   (`order: 0..n-1`) to close the gap left behind.
2. Splice the moved `PageCard`'s id into the destination Page's existing order at
   `destIndex`, then renumber the whole resulting list `0..n-1` — same
   "renumber everything, no fractional ordering" convention as the existing
   `reorderPageCards`. The moved row also gets `pageId: destPageId` set in the same
   pass for cross-page moves.

Exposed as `PUT /api/page-cards/:id/move` (`packages/api/src/routes/pageCards.ts`),
body `{ destPageId, destIndex }`. It's an ad hoc route, not wrapped in the
Operation registry — same reasoning as the existing remove/delete-from-page routes:
Move is a structural placement action that should work for every CardType, not one
gated per type.

One deliberate omission: unlike `removeFromPage`, this never touches
`savedToVault`. `removeFromPage` auto-promotes an unsaved Card to the Vault first
because removal can leave it with no Page at all; a move never does — the `PageCard`
is attached to exactly one Page throughout, source and destination both handled in
the same transaction — so that safety net doesn't apply here.

## Frontend: a mode, not a drag

Modeled on the existing `isEditing` pattern in `App.tsx` rather than introducing
drag-and-drop (there's no dnd library in this codebase, and drag is a poor fit for a
mobile-first PWA with scrolling Pages):

- `movingPageCardId: string | null` (`App.tsx`) — the `PageCard` "in transit," or
  null. Tapping Move in the Dock (only shown when a Card is selected) sets it;
  tapping Cancel clears it.
- **Persists across Page navigation for free.** `movingPageCardId` lives in `App.tsx`,
  above `PageStack`; navigating Pages remounts `PageStack`'s own DOM (it's keyed on
  the current Page id) but never touches `App.tsx` state, so the same Card stays
  "picked up" as you browse to find a destination.
- **Dock**: while moving, the whole Dock collapses to a single Cancel button — no
  Vault toggle, no other actions — so tapping any drop target is the only next step
  (`Dock.tsx`).
- **PageStack**: the Card being moved renders dimmed in its original slot (a ghost,
  not removed outright) via `.page-stack__slot--moving`. Explicit tappable
  "Drop here" zones (`.page-stack__drop-zone`) render before the first Card, between
  every pair, and after the last — deliberately large tap targets rather than thin
  hover lines, since this is a tap-first mobile interaction. The two zones
  immediately adjacent to the Card's current position are skipped (dropping there
  would be a no-op).
- **`toDestIndex` (`PageStack.tsx`)** converts a "gap" position in the *full* rendered
  list (which still counts the moving Card's own ghosted slot as one item) into the
  `destIndex` the move API expects — a position among siblings only, since the moving
  Card is excluded from the destination's existing order before being spliced back in.
  Getting this off-by-one wrong was an actual bug caught during manual verification
  (curl against a live dev server, cross-page move and same-page reorder both
  checked) before it shipped.
- **New Page as a destination**: the existing PageNav "+" control (already the way a
  new Page gets created at the bottom of the stack once you've navigated past the
  last one) is repurposed while moving — tapping it creates a new Page and
  immediately drops the Card there as its first Card, instead of just navigating to
  it (`App.tsx`'s `handleDropOnNewPage`).

### Files touched

- `packages/api/src/services/pageCardService.ts` — `movePageCard`
- `packages/api/src/routes/pageCards.ts` — `PUT /:id/move`
- `packages/web/src/api/client.ts` — `movePageCard` client call
- `packages/web/src/App.tsx` — `movingPageCardId` state/handlers, prop wiring
- `packages/web/src/components/Dock/Dock.tsx` — Move action, move-mode Dock row
- `packages/web/src/components/primitives/Icon.tsx` — new `move` icon
- `packages/web/src/components/PageStack/PageStack.tsx` / `.css` — drop zones, ghost
  styling
- `packages/web/src/i18n/en.json` — `dock.action.move`, `dock.action.cancelMove`,
  `pageStack.dropHere`

## Also: removed the redundant bottom stack-edge bars

`PageStackEdges` drew a decorative sliver of thin bars at both the top and bottom
edge of the Page viewport, hinting at how many Pages sit above/below the one in
view. The bottom bars sat directly above `PageNav`'s dot row, which already shows
position in the stack on its own — pure duplication with no added information.
Removed the bottom bars and the now-unused `below` prop
(`PageStackEdges.tsx`/`.css`, `App.tsx`'s `pagesBelowCount`); the top bars are
unchanged.

# Step 9 — Interaction Overhaul: Tabs, Dock Cards, Feed Input Button

Referred to throughout the code as "Step 6 spec" (an earlier planning pass whose
numbering diverged from this `docs/stepN` sequence — that spec document itself was
never checked into `docs/`, only quoted piecemeal in code comments; this file is the
first `docs/stepN` write-up of what it actually produced). Landed across two sessions
— Vault folders shipped first (`20260712060528_add_folders`, commit `0deda15`) — with
Tabs, Dock Cards, and the Feed Input Button sitting implemented-but-uncommitted until
they were bundled into the same commit as Step 10's rich-text rewrite (`89dd574`).
This doc covers the latter three; Vault folders predate this doc and aren't detailed
here.

Three things change the app's top-level shape:

1. **Tabs** — a new horizontal layer *above* Pages. Each Tab owns its own independent
   vertical Page stack; Tabs never share generation context with each other.
2. **Dock Cards** — a persistent scratchpad of Cards that live outside every Page/Tab
   entirely, reachable from the Dock regardless of where you're navigated.
3. **Feed Input Button** — replaces the old menu-row "Add Card"/"Generate" actions with
   a single inline control living in the Page's own content flow, not the Dock.

Also: the standalone `PageNav` component is gone, merged into a compact cluster inside
the Dock's own base bar; and **Selection Lock** — while anything is selected (a Page
Card, Dock Card, or embed), Tab/Page navigation is disabled everywhere (swipe, arrows,
the Tabs/Pages panels) until it's deselected, so a generation/edit context never gets
pulled out from under you mid-action.

## Data model (`packages/api/prisma/schema.prisma`, migration `20260716063508`)

```prisma
model Tab {
  id, order, title, createdAt, updatedAt
  pages Page[]
}

model DockCard {
  id, cardId, order, createdAt, updatedAt
  card Card @relation(..., onDelete: Cascade)
}
```

- `Page` gained a required `tabId` (`onDelete: Cascade` — deleting a Tab takes every
  Page, and every PageCard inside them, with it). The migration backfills existing
  Pages onto a synthetic `"default-tab"` row so the column can be `NOT NULL` from day
  one with no nullable transition period.
- `DockCard` is a thin join (`cardId`, `order`) — a Card living in the Dock has no
  draft-staging fields of its own (unlike `PageCard`'s `draftTitle`/`draftContent`):
  edits write straight through to the `Card` row, same convention an embed already
  uses. Deleting a `DockCard` row never deletes the underlying `Card` on its own — see
  `removeDockCard` below for the one case it does.

## Backend

- **`tabService.ts`** / `GET,POST,DELETE /api/tabs`: list (ascending `order`), create
  (appended at the right-hand end, default title `"Tab N"`), delete (cascades to its
  Pages). No "keep at least one Tab" guard server-side — `App.tsx`'s bootstrap effect
  creates a fresh one the instant the list would otherwise go empty, mirroring the
  existing "keep `currentPageId` pointing at a real Page" convention.
- **`pageService.ts` / `routes/pages.ts`**: `listPages`/`createPage` now take a
  required `tabId` — `GET /api/pages` 400s without a `?tabId=` query param, `POST
  /api/pages` without a `tabId` body field. "Top of the stack" (`createPage`'s default
  `order`) is scoped to that Tab's own Pages, since `order` values aren't meaningful
  across different Tabs.
- **`dockCardService.ts`** / `GET,POST /api/dock-cards`, `POST /api/dock-cards/files`,
  `DELETE /api/dock-cards/:id`, `PUT /api/dock-cards/:id/move-to-page`:
  - `addExistingCardToDock`/`createCardInDock`/`addFileCardToDock` all append at the
    end of the existing `order` (mirrors `pageCardService`'s "bottom of the Page"
    convention). `createCardInDock`/`addFileCardToDock` create the Card with
    `savedToVault: false` — page-local-scratch style, same as `addNewCardToPage`.
  - `removeDockCard` (the panel's "Close" action) branches on `savedToVault`: a Card
    already in the vault just gets unpinned (its `DockCard` row deleted, the vault
    Card untouched); a Card that only ever lived in the Dock has nowhere else to be,
    so Close deletes it outright, taking its `DockCard` row with it via cascade.
  - `movePageCardToDock`/`moveDockCardToPage` are the two directions of the Dock ⇄
    Page boundary (`PUT /api/page-cards/:id/move-to-dock`, alongside the existing
    `PUT /api/page-cards/:id/move`): moving a `PageCard` onto the Dock flushes any
    pending draft into the real `Card` first (a `DockCard` has no draft slot to carry
    it into), then deletes the `PageCard` and appends a new `DockCard`; the reverse
    deletes the `DockCard` and splices a new `PageCard` into the destination Page at
    a specific index, renumbering siblings the same "renumber everything" way
    `movePageCard`/`reorderPageCards` already do. Both run inside one
    `prisma.$transaction`.
- **`app.ts`**: mounts `tabsRouter` at `/api/tabs` and `dockCardsRouter` at
  `/api/dock-cards`.

## Frontend

### Tabs (`useTabs.ts`, `TabsPanel.tsx`, `App.tsx`)

- `useTabs()` — thin fetch/refresh/create/delete hook, same shape as every other data
  hook in this codebase (`usePages`, `useVault`).
- `App.tsx` owns `currentTabId`; a bootstrap `useEffect` keeps it pointing at a real
  Tab the same way `currentPageId`'s own bootstrap does — defaults to the leftmost on
  first load, re-settles if the current one is deleted out from under it, creates a
  fresh Tab if the list would otherwise be empty. `usePages(currentTabId)` re-fetches
  whenever it changes.
- **Switching Tabs**: `switchToTabIndex(index)` — the Tabs panel's click target and
  the swipe gesture's resolved action, a no-op at the edges (no wraparound) or if
  already on that Tab. Deselects everything on the way in.
- **Swipe gesture** (`handleSwipeAreaPointerDown/Up/Cancel`, `App.tsx`): Pointer Events
  (covers touch/mouse/pen in one set of handlers) tracked from `pointerdown` origin to
  `pointerup`, resolved by displacement (`SWIPE_THRESHOLD_PX = 60`, and horizontal
  displacement must exceed 1.5× the vertical to avoid mistaking a scroll for a swipe)
  rather than dragging anything live — doesn't fight `PageStack`'s own per-Card tap/
  long-press handling. Skips the Dock (its own horizontal scroll rows shouldn't
  trigger this) and any editable element (a text-selection drag inside a Card
  shouldn't either), via `target.closest(".dock"), closest("input, textarea,
  [contenteditable]")`.
- **`TabsPanel.tsx`** — the Dock's Tabs extended panel: a scrollable list of every Tab
  for jumping straight to one (the swipe gesture remains the primary way to move
  between *adjacent* Tabs), plus a "+" row that creates a new one at the right-hand
  end.

### Dock Cards (`useDockCards.ts`, `DockCardsPanel.tsx`)

- `useDockCards()` — same fetch/refresh shape as the others, plus
  `subscribeToSaves(refresh)` (`cardStore.ts`'s existing pub/sub) since a Dock Card
  writes straight through with no draft step: an edit made through the Vault panel (or
  any other open instance of the same Card) needs to be picked up without waiting on
  some unrelated refresh.
- **`DockCardsPanel.tsx`** — the extended panel behind the Dock's Dock Cards toggle.
  Three mutually-exclusive views (never the list and a Card's content on screen at
  once): `"menu"` (a plain list of every Dock Card, "+"" row to create one),
  `"card"` (single-Card view with left/right step arrows, rendered via the existing
  `CardEmbed` component — a Dock Card has no draft-staging concept of its own, exactly
  like an embed), `"creating"` (reuses `FeedInputButton` with `showGenerate={false}` —
  a Dock Card has no Page/Tab to draw generation context from, so Add is the only way
  a Card gets created there). Tapping a Card in the `"card"` view toggles its
  selection (driving the Dock's own Edit/Save/Move to Page/Close row, the same shape a
  selected Page Card gets); double-click/long-press jumps straight into editing.
  **Deviates from the "always-visible horizontal scroll row" phrasing in some Step 6
  spec code comments** — in the shipped implementation Dock Cards are reached the same
  way Vault/Pages/Tabs are, through the extended panel toggle, not a permanently
  docked strip in the base bar.
- `App.tsx`'s `dockCardToOpen` — set right after a Card lands in the Dock from
  elsewhere (moved off a Page, or added from the Vault); `DockCardsPanel.tsx` jumps
  straight to it in the single-card view the moment it appears in `dockCards`, then
  fires `onOpenedCard` to clear it back to `null` so it doesn't keep forcing that
  navigation on every later render.

### Feed Input Button (`FeedInputButton.tsx`)

Reads as a plain line of placeholder text sitting in the Page's own content
(`PageStack.tsx` renders it directly below the lowest Card; `DockCardsPanel.tsx`
reuses it for its own "creating" view) — no box, no border, no shadow, deliberately
not a floating toolbar widget. Tapping the placeholder swaps it for a real inline text
input in the same spot.

- **Circle** (left) — Generate, using whatever's typed as an optional guided
  instruction (compiled server-side via the existing `"interactive"` prompt mode
  instead of plain `"generate"` — see step10's doc for what that mode's prompt now
  also enforces). Becomes a Stop action, spinning, while a generation is in flight.
  Hidden entirely (`showGenerate={false}`) inside the Dock Card creation flow — there's
  no Page/Tab context to generate against there.
- **Add (+)** — creates a Card directly from whatever's typed, bypassing the model
  entirely (blank if nothing's been typed).
- **Ellipsis** — opens a small popup (own click-outside-to-close, same convention as
  `CardLinkPicker`/`ProcessPicker`) with Open from Vault, Upload File, and a card-type
  picker. The type picker is a stub (only the `"note"` type exists today —
  selecting one only changes local highlight state; neither `addNewCardToPage` nor
  generation currently accept a forced type override).

### PageNav → merged into the Dock

The standalone `PageNav.tsx`/`.css` component (two arrows in their own flex row
between the Page content and the Dock) is deleted. Its up/down navigation, the
"Add Page" affordance (the down arrow becomes `+` once there's nothing below), and
the Pages panel toggle are now one compact cluster pinned to the Dock's own base bar,
bottom-right corner (`Dock.tsx`'s `dock__page-nav`), alongside a `currentPageIndex +
1`/`sortedPages.length` counter and, further right and visually more subtle
(`dock__page-nav-tabs`), the Tabs panel toggle with its own counter. Hidden under
Selection Lock the same way the rest of the row's per-selection actions are (see
below) — a selected *Dock* Card is the deliberate exception, same as the Vault toggle.

### `PagesPanel.tsx`

The vertical counterpart to `TabsPanel.tsx` — a scrollable quick-jump list of every
Page in the *current* Tab (the up/down arrows remain for adjacent navigation; this is
for jumping straight to a distant one). Pages have no title of their own
(`schema.prisma`'s `Page` model), so each row is labeled by stack position (`"Page N
of Total"`) plus a preview of its first Card's title, so rows are distinguishable.

### Selection Lock (`App.tsx`)

Once anything is selected (a Page Card, a Dock Card, or an embed), every route into
Tab/Page navigation is disabled until it's deselected again — the swipe handler's
`pointerdown` guard, `switchToTabIndex`'s own guard (the shared choke point every
caller goes through, checked again even though the Tabs panel toggle is already
unreachable by then), and the up/down arrows all check `selectedPageCardIds`/
`movingPageCardIds` before acting. `Dock.tsx` hides the Vault/Pages/Tabs toggles from
its base bar entirely (not just disables them) the moment a Page Card or embed is
selected, leaving only that selection's own actions — a selected *Dock* Card is the
deliberate exception (Vault toggle and the page-nav cluster both stay reachable, same
as during a Page Card/Dock Card Move, since reaching a destination Page/Tab requires
navigating there mid-move).

## Files touched

**`packages/api`**: `prisma/schema.prisma` + migration `20260716063508_add_tabs_and_
dock_cards` (new `Tab`/`DockCard` models, `Page.tabId`), `src/services/tabService.ts`
(new), `src/services/dockCardService.ts` (new), `src/routes/tabs.ts` (new),
`src/routes/dockCards.ts` (new), `src/routes/pages.ts` / `src/services/pageService.ts`
(tabId scoping), `src/routes/pageCards.ts` (`PUT /:id/move-to-dock`), `src/app.ts`
(mounts the two new routers).

**`packages/web`**: `src/hooks/useTabs.ts` (new), `src/hooks/useDockCards.ts` (new),
`src/components/Dock/TabsPanel.tsx` / `.css` (new), `src/components/Dock/
DockCardsPanel.tsx` / `.css` (new), `src/components/Dock/PagesPanel.tsx` / `.css`
(new), `src/components/FeedInputButton/FeedInputButton.tsx` / `.css` (new),
`src/components/Dock/Dock.tsx` / `.css` (page-nav cluster, panel toggles, Selection
Lock visibility), `src/components/PageStack/PageStack.tsx` (renders `FeedInputButton`
below the lowest Card), `src/App.tsx` (`currentTabId`, swipe handlers,
`switchToTabIndex`, Selection Lock guards, all the new hooks/handlers wired into
`Dock`/`PageStack`), `src/components/primitives/Icon.tsx` (`more`, `tray`, `pages`,
`tabs`, `back`, `save`), `src/i18n/en.json` (`feedInput.*`, `dockCards.*`,
`dock.tabs.*`, `dock.pages.*`, `dock.action.{back,moveToDock,close,fold}`,
`tabs.new`). `src/components/PageNav/PageNav.tsx` / `.css` deleted.

## Known limitations / deliberate scope cuts

- The card-type picker in the Feed Input Button's popup is a stub — only `"note"`
  exists to pick.
- No "keep at least one Tab" server-side guard — enforced entirely by `App.tsx`'s
  bootstrap effect creating a replacement the instant the list would go empty.
- Dock Cards have no independent ordering UI beyond creation-order append; no drag
  reorder within the scratchpad.

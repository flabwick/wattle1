# Step 6 — Vault Sync Fixes

The vault's core promise — one Card, one copy, every view of it agrees — had three
separate holes. All three are closed now, plus a Dock UX fix for how a Card gets
removed from a Page.

## 1. Stale content on page navigation

`navigateUp`/`navigateDown` (`App.tsx`) only ever changed `currentPageId` local state.
Nothing re-fetched `pages`, so returning to a Page you'd left could show whatever was in
React state from several interactions ago rather than the current server truth. Both now
call `refresh()` after switching Pages.

## 2. `cardStore.publishCard`'s guard blocked legitimate refreshes

`cardStore.ts`'s `publishCard` (the write path `usePages.ts`'s `refresh()` uses to feed
every fetched Card into the shared cache) skipped publishing outright whenever
`writeInFlight` had an entry for that Card — meant to stop a concurrent GET from
clobbering a write that hadn't landed yet, but it fired for *any* in-flight write,
including one whose response had already been applied and whose *next* `refresh()` was
now trying to deliver the authoritative post-write value. The guard now checks
`writePending` (edits genuinely not yet sent) instead of `writeInFlight` (sent, response
pending or already applied) — the only case that actually justifies dropping an incoming
publish.

## 3. `useVault` was a fully disconnected copy

The Vault panel (`useVault.ts`) fetched its own `Card[]` on a 200ms debounce and held it
in local `useState`, with no read or write path through `cardStore` at all — editing a
Card anywhere else never touched the Vault panel's copy until its own timer happened to
refire. It now publishes every Card it fetches into `cardStore` (same as `usePages.ts`),
and subscribes to a new `notifySaved`/`subscribeToSaves` signal so it refreshes itself
immediately whenever *any* Card is durably saved — the top-level Save action
(`App.tsx`'s `handleSave`), an embed edit, or a Page-local Card getting promoted into
the Vault by "Remove from Page" — instead of only reacting to its own search query
changing. `App.tsx`'s manual `vault.refresh()` calls after those actions are gone,
replaced by explicit `notifySaved(cardId)` calls at each write site.

## 4. Top-level Cards now live-sync like embeds do

The bigger gap: even with 1–3 fixed, a Card already saved to the Vault and opened on two
different Pages still didn't agree while you were *typing* — the top-level editor
(`Card.tsx`) only ever wrote to that one `PageCard`'s local `draftTitle`/`draftContent`,
requiring an explicit Dock Save click to reach the actual Card row at all, and even then
only the Page you clicked Save on picked it up immediately.

`Card.tsx` now branches on `pageCard.card.savedToVault`:

- **Already in the Vault** — reads and writes through the same shared `cardStore` a
  `CardEmbed` uses (`useCard` for live display, `editCard` for writes). Every keystroke
  commits straight to the Card row, debounced/coalesced per `cardId` exactly like an
  embed edit, and any other mounted view of that same Card — another Page's `PageCard`
  for it, or an embed — updates the instant the write lands, no Save click or page
  reload required. The Dock's Save button naturally goes permanently-disabled/ticked for
  these Cards, since `draftTitle`/`draftContent` are never set for them any more — there
  is nothing left for it to do.
- **Never yet saved** — unchanged: still the page-local draft flow, since a brand-new
  Card is deliberately scratch content (`Card.savedToVault: false`) until its first
  explicit Save promotes it. That Save is what flips the switch to the live path above.

Only the `"note"` CardType (`PageStack.tsx`'s `PageCardSlot`) goes through `Card.tsx` —
`file`/other registered types still use their own `cardTypeUiRegistry` View/Editor,
untouched by this change.

## 5. Dock: Remove vs. Delete

A selected Card's Dock actions previously included both a "remove" action (unlink from
this Page only, Vault copy kept) and a separate danger "delete" action (trash-bin icon,
permanently erases the Card everywhere via `card.delete`). The bin button read as
destructive-by-default and duplicated a capability the Vault panel already exposes (its
own per-row delete). It's gone from the per-Card Dock now; the one remaining action is
an "X" (`close` icon) that does exactly what "remove" always did — unlinks the Card from
this Page, leaves the Vault entry untouched, reopenable any time. Permanently deleting a
Card from the Vault entirely is now only ever done from the Vault panel's own list.

## Verified

- `tsc --noEmit` clean on `packages/web` after every change in this step.
- Manual verification still recommended for the full multi-Page live-sync path (same
  Card open on two Pages simultaneously isn't actually possible — only one Page is
  mounted at a time — so the real test is: edit on Page A, navigate to Page B, confirm
  it shows the edit with no Save click in between).

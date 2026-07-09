# Step 5 — Dock-Driven Interaction Model

Step 4 gave the frontend its visual language (tokens, primitives, styling.md). Step 5
reworks *how you interact* with it: every action moves off the Card/Page themselves and
onto the Dock, Cards and Pages are reachable one-handed via gesture rather than a
button-per-action, and the Vault gains a real "staging" relationship to what's on a
Page instead of being fully independent of it. None of this changes the Step 1–4
foundation (registries, providers, metadata, design tokens) — it's entirely
`packages/web` interaction/UX plus one small, additive schema change.

## 1. Vault moved into the Dock

The old `App.tsx` had a top-level Pages/Vault tab switcher swapping the whole main
content area. That's gone: `PageStack` is now the only thing in `.app__main`, and
`VaultView` is reachable as a toggleable extension panel inside the Dock itself
(`Dock.tsx`'s `vaultOpen` state, `.dock__vault-panel`). Opening a vault Card or creating
a new one both close the panel afterward (`setVaultOpen(false)`), landing you back on
the Page where the result actually shows up.

## 2. Icon-only UI

New primitive: `components/primitives/Icon.tsx` + `Icon.css` — a hand-drawn line-icon
set (`edit`, `generate`, `remove`, `delete`, `done`, `plus`, `file`, `vault`, `close`,
`search`, `up`, `down`), styled purely from two new tokens (`--icon-size`,
`--icon-stroke-width`), matching styling.md §6's "simple, refined line icons." `Button`
gained an `iconOnly` prop that squares the button up (44×44, later 36×36 — see §5)
instead of text padding.

Every action button across the app now shows only its icon, with the old visible label
kept as `aria-label`/`title` (accessible name + hover tooltip). There's no "save" or
"open" icon in the final set — see §8 for why `save` disappeared, and §3 for why
`open` was replaced by "click the row."

## 3. Vault compressed to an IDE file list

`VaultView.tsx` no longer renders bordered "card" boxes with a title/content preview
and a separate Open/Delete button pair. It's a flat, dense list now: a search bar (with
a leading `search` icon) and a "new file" icon button in one toolbar row, then plain
rows below — a small `file` icon + monospace filename, click the row to open it,
`delete` icon at the end. No content preview; a vault row is a filename, not a card.

The "new file" action doesn't show a title/content form at all. It calls the same
`createCardInPage` operation `PageStack`'s old "+Card" used — creates a blank Card
directly on the current Page and closes the panel, so it appears immediately as an
editable inline Card exactly like any other, the same way a new file in an IDE opens
straight into the editor instead of prompting for its contents first.

## 4. Full-screen Pages

`PageStack.tsx` no longer stacks every Page in one scrolling column. One Page fills the
screen at a time — no title, no bordered "folio" box, it *is* the screen — and a new
`components/PageNav/PageNav.tsx` component (rendered by `App.tsx` as a normal flex row
between `<main>` and `<Dock>`, **not** `position: fixed`) has just two arrows: up moves
to the Page stacked above (higher `order`), down moves below.

Pages are only ever added at the bottom of the stack. There's no separate "new Page"
button: once there's nothing below the current Page, the down arrow's icon itself
swaps from `down` to `plus` and creates a new Page there instead of navigating
(`PageNav.tsx`'s `atBottom` branch). `App.tsx` computes the new Page's `order` as one
less than the current bottom Page's (`bottomOrder - 1`), and `usePages.ts`'s `addPage`
now accepts that explicit order and returns the new Page's id so `App.tsx` can navigate
straight to it — previously `createPage` only ever appended on top with no way to
target the bottom, and nothing navigated to a freshly created Page at all.

Because `PageNav` is a real layout sibling of the Dock rather than an overlay, it's
mathematically impossible for it to sit under the Dock no matter how tall the Dock
gets — verified by measuring bounding boxes across every Dock state (empty, Page
selected, Card selected, Vault panel open) and confirming zero overlap in all of them,
including when the Vault panel expands the Dock to 3-4× its baseline height.

Whichever Page is currently in view counts as "selected" for the Dock's Add Card/Delete
Page actions whenever no Card is selected (`App.tsx`'s `selectedPageForDock`) — there's
no separate click-to-select-a-Page step.

## 5. The Dock is a single, consistent-height row

Before this step the Dock had up to three visually different shapes: an empty state
with placeholder text, a Vault-toggle row above a title above an action row, and (Card
selected) that same stack with a different action row. Now it's always exactly one row
(`.dock__row`) — no title text anywhere, ever, in any mode. The Vault toggle is the
first button in that same row rather than a header row of its own. Only the expandable
Vault panel or a live generation preview (both genuinely temporary) ever make the Dock
taller than that one row, and even then §4's layout guarantees `PageNav` stays clear of
it.

The Dock's own buttons (and `PageNav`'s) also shrunk to a new `--touch-target-sm` (36px)
/ `--icon-size-sm` (16px) token pair — `tokens.css` documents these as specifically for
"secondary/frequent controls that don't need the full 44px minimum," not a general
replacement for `--touch-target-min`.

`Dock.tsx` computes one `actions` array per render (`[vaultAction, ...modeActions]`)
instead of three separate early-return JSX blocks — `modeActions` is `[]` when nothing's
selected, the Card set (`Edit`/`Save`/`Generate`/`Remove`/`Delete`) when a Card is
selected, the Page set (`Add Card`/`Delete Page`) when a Page is.

## 6. Card fold caret

`Card.tsx` gained a small disclosure caret — the existing `down` icon, rotated via CSS
(`.card__caret--collapsed`) rather than a second icon — sitting immediately left of the
title, small and unbordered (`.card__caret-btn`: 20px hit area, 12px icon, no
border/background/shadow, muted color) so it reads as a quiet UI affordance rather than
another tactile button competing with the title. Collapsing hides `.card__preview`;
title and the (now-removed, see §8) badge always stay visible. Purely local `useState` —
nothing else in the app needs to know a Card is folded.

## 7. Inline editing: gesture-driven, no explicit close

Three related changes to how a Card's inline editor (the title input + textarea that
replaces its body — unchanged since Step 3/4) opens and closes:

- **Double-click / long-press to edit.** `Card.tsx`'s `CardShell` now has
  `onDoubleClick={onRequestEdit}` for desktop, plus manual long-press detection for
  touch (`onTouchStart` starts a 500ms timer, `onTouchEnd`/`onTouchMove`/`onTouchCancel`
  cancel it — real touch hardware doesn't fire `dblclick`). `App.tsx`'s
  `requestEditPageCard(id)` sets `selectedPageCardId` *and* `isEditing` together,
  deliberately bypassing the plain-tap `selectPageCard` wrapper (which resets
  `isEditing`) so a double-click/long-press on an unselected Card selects **and** opens
  it in one action rather than needing two.
- **Click outside to close, not a Done button.** The editing view has no explicit
  close/checkmark button any more. A `pointerdown` listener (active only while
  `editing`, scoped to presses outside the editor's own DOM node) calls `onSelect()`,
  which — since the Card is always selected while editing — toggles it back to
  deselected, closing the editor as a side effect of `App.tsx`'s existing
  selection-reset logic. Clicking the title/content inputs, or the static caret
  placeholder, is correctly ignored (inside the ref'd container).
- **Editor and static views are pixel-flush.** The editing view renders the *same*
  `.card__header`/`.card__header-start` structure (including a non-interactive stand-in
  for the caret, `.card__caret-btn--static`, occupying the identical 20px slot) so the
  title input lines up exactly where the static title span sits — verified by measuring
  both states' bounding boxes and confirming 0px x/y difference. A second, subtler bug
  fixed alongside this: `CardShell.css`'s `.card-shell--editing` had its own flex `gap`
  stacked on top of `.card__header`'s `margin-bottom`, silently doubling the space
  between the header and the content textarea versus the static preview's position;
  the gap was removed so both states share the exact same single spacing mechanism.

## 8. Save button (+ → tick) and the Vault staging layer

Two iterations happened here before landing on the final behavior — worth recording
since the first one was explicitly reverted:

- **First pass (reverted): auto-save, no Save button, no badge.** Chained
  `updatePageCardDraft` + `savePageCardToVault` on every keystroke and removed the Dock
  Save action and the Card's "unsaved" `Badge` entirely. Explicitly undone — the Dock's
  Save action was restored.
- **Final behavior: Save stays manual, but *is* the indicator.** The separate "unsaved"
  `Badge` on `Card.tsx` is still gone, but not because saving is automatic — because the
  Dock's Save button's own icon now doubles as that indicator: `plus` while there's
  something to commit, `done` (a tick, and disabled) once it's saved. No redundant
  marker rendered twice.
- **The Vault gained a real staging relationship to Pages.** Previously a Card created
  via "+Card" (or a generation result) was *already* a fully independent, vault-listed
  entity from the moment it existed — Save only mattered for edits made *after* that.
  Now `Card.savedToVault` (new `Boolean @default(true)` column, migration
  `20260709054912_add_card_saved_to_vault`) tracks whether a Card has ever actually been
  saved to the Vault:
  - `addNewCardToPage` (new Card on a Page) and `generateFromCard` (a generation's
    result) both create their Card with `savedToVault: false` — page-local scratch
    content, per spec1.md Part 3's "staging layer... between 'in context' and 'in the
    vault'", now enforced as data rather than just a UI convention.
  - `GET /api/cards` (the Vault list/search, `cardService.listCards`) filters to
    `savedToVault: true` only — an unsaved Card genuinely doesn't show up in Vault
    search, not just visually de-emphasized.
  - `pageCardService.saveToVault` (the Save action) is the one place a Card ever flips
    to `savedToVault: true`, alongside its existing job of copying draft fields onto the
    Card and clearing them.
  - `pageCardService.removeFromPage` ("Remove from Page") now checks the flag: removing
    an already-saved Card still just unlinks the `PageCard` (vault copy untouched, as
    before); removing a Card that was *never* saved deletes it outright instead of
    leaving an invisible, permanently-orphaned row (there's no vault copy to preserve).
  - The Dock's Save button's enabled/disabled state (`Dock.tsx`'s `hasUnsavedDraft`) now
    checks `!selected.card.savedToVault` in addition to the pending-draft check, so a
    freshly created Card that hasn't been typed into yet still correctly shows `+`
    (needs saving) rather than a misleading disabled tick.
  - `packages/shared/src/types.ts`'s `Card` interface gained `savedToVault: boolean`,
    threaded through every place a Card gets serialized
    (`cardService.serializeCard`, `pageService.serializePageCard`'s inline type,
    `generationService.generateFromCard`).

## Verified

- `npm run build` across all four packages (`shared` → `prompt-engine` → `api` →
  `web`) and `tsc --noEmit` on each — clean throughout every change in this step.
- Every sub-feature above was exercised end-to-end in a real headless browser
  (Playwright): Vault-in-Dock open/close, icon-only buttons' `aria-label`s, IDE-list
  vault search/create/open/delete, full-screen Page navigation including the
  down-arrow-becomes-plus boundary case and the auto-navigate-to-new-Page behavior,
  Dock height/overlap measurements in all four states, the fold caret, double-click and
  long-press entering edit mode (long-press verified via manually dispatched
  `TouchEvent`s — `page.touchscreen.tap()`'s raw coordinate API doesn't reliably
  produce browser-*trusted* touch sequences in this environment, `locator.tap()` does;
  see the gesture-verification history in this session for the false-alarm this caused
  before `locator.tap()` was used instead), click-outside-to-close, pixel-exact
  editor/static alignment (0px diff on title and content position), and the full
  Vault-staging lifecycle (new Card invisible in Vault → Save → visible in Vault →
  remove-a-saved-Card keeps it → remove-a-never-saved-Card deletes it with no orphan).
- All test Pages/Cards created during verification were deleted via the API afterward,
  each time — the dev database was left empty.
- One recurring false alarm worth documenting for whoever hits it next: several rounds
  of "it's broken" during this step turned out to be a stale browser tab holding a
  `pageCardId`/`cardId` that a *previous* verification pass's cleanup had already
  deleted server-side — every PATCH/DELETE against it 500s with Prisma's "record to
  update/delete not found." Not a code bug; the fix is reloading the tab. Worth a beat
  of suspicion before assuming new console errors indicate a regression in this app
  specifically, since verification and manual testing share one dev database.

## Open items / not done in this step

- **Stacks (sideways substitution)** — spec1.md Part 2's "swipe/click an arrow to
  substitute one Card for another in the same slot" is still not built. Cards within a
  Page are a plain list; there's no sub-grouping mechanism yet.
- **Reordering** — `PUT /api/pages/:pageId/cards/reorder` and `PUT /api/pages/reorder`
  exist and work, but no frontend drag/up-down control calls them yet.
- **`typeId`** — still just `"note"`, unchanged since Step 3 (see that step's doc).

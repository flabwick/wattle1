# Step 14 — File Rendering, Card Header Consistency, Action/Prompt Cards, Hide/Show

Four smaller, related passes over the existing Card/Dock UI, landed in the same
session as Step 13's rich text work: making uploaded files actually render, making
every CardType's header behave the same way, adding two new CardTypes on top of the
Step 13 infrastructure, and finishing the pre-existing (but half-built) hidden-Card
feature.

## 1. File cards render PDFs and Markdown

Previously a "file" Card (`FileView.tsx`) only ever showed the uploaded filename in a
read-only textbox, regardless of what was uploaded.

- **`packages/api/src/routes/cards.ts`** — new `GET /api/cards/:id/file`, streaming
  the uploaded bytes back (`res.sendFile`, `Content-Type` from `metadata.file.mimeType`,
  `Content-Disposition: inline`). Nothing served the bytes back to the browser before
  this — the upload flow only ever wrote them to disk.
- **`FileView.tsx`** — branches on extension/MIME type: a `.pdf` renders inline via
  an `<iframe>` (the browser's own PDF viewer — no client-side PDF library needed);
  a `.md`/`.markdown` file is fetched as raw text and rendered with `react-markdown`
  + `remark-gfm` + `rehype-highlight` (tables, task lists, syntax-highlighted fenced
  code); anything else keeps the filename-only fallback. Every variant now shares a
  header (title + an uppercased-extension `Badge`, e.g. `PDF`/`MD`) and a fullscreen
  corner button, matching every other CardType.
- **Sizing fixes** (follow-up feedback): the PDF `<iframe>` uses `aspect-ratio: 1 /
  1.4` (page-like proportions) instead of a fixed `60vh` height; the Markdown
  preview's `max-height`/`overflow-y` clipping was removed entirely so a long file's
  Card grows to its full content length like a note Card, instead of scrolling
  inside a fixed box.

## 2. Card header consistency

Several inconsistencies accumulated as CardTypes were added independently (Stack,
File) alongside the original note Card:

- **Every CardType's header now gets the same "X" close button**, wired to a new
  `onRequestRemove` prop threaded through `CardTypeViewProps`/`CardTypeEditorProps`
  → `PageStack.tsx`'s `PageCardSlot` → `App.tsx`'s `handleRequestRemovePageCard`
  (closes a Stack as a whole via `closeStack`, promoting any unsaved alternate
  first; anything else just detaches via `removePageCardFromPage` — same two rules
  the Dock's old Remove/Close Stack actions had).
- **Consistent header-action ordering**: `+` (type-specific add action, e.g. "turn
  into stack") → `[]` (expand to fullscreen) → `x` (remove) everywhere — Card.tsx's
  note header previously rendered these in the wrong order ([] before +); Stack's
  own rail already put its "+" first by virtue of DOM position, which is what
  surfaced the inconsistency.
- **Stack's duplicate "+" removed** — `StackBody.tsx` had two "+" buttons doing the
  same thing (`CardStackRail`'s own trailing button, which already morphs from a
  right-caret into "+" once you're at the last alternate and shows `<n>/<total>`
  with more than one member, plus a second explicit "+" in the header-actions
  cluster). The header-actions duplicate was removed; the rail's existing
  toggle-to-"+"-at-the-end behavior is now the sole "+".
- **Dock action row cleanup**: with per-Card X/close available directly, the Dock's
  `selectedCards` row lost `removeSelected` ("Remove"), `closeStack` ("Close
  Stack"), `makeStack` ("Make a Stack" — redundant with the note header's own "+"),
  `removeStackAlternate` ("Remove this alternate" — no replacement; only closing a
  whole Stack is reachable now, not removing one alternate), and `deleteStack`
  ("Delete Stack", the trash-can action — **no UI path exists any more to
  permanently delete an entire Stack and all its alternates**; the underlying
  `api.deleteStack` call still exists if this needs to come back). Remaining row
  order: back → generate → save (or a selected Stack's `saveStackAlternate`, now in
  the *same* slot as the generic Save rather than after Move) → move → Hide/Show
  (new, see §4) → annotate actions.

## 3. "Action" and "Prompt" CardTypes

Step 13's inline `actionButton` node only ever placed a calibrated job button
*inside* a note's rich text. These two new CardTypes let the same underlying
concepts stand alone as their own Cards.

- **Infrastructure fix, needed for both**: `PageStack.tsx`'s `PageCardSlot`
  previously only forwarded `onRunActionJob`/`generatingPageCardId`/`pageSiblings`
  to the hardcoded "note" branch (`CardView`) — any *other* registered CardType had
  no way to fire a job or know if one was running. `CardTypeViewProps`/
  `CardTypeEditorProps` gained these fields, now threaded through generically, so
  any future CardType gets this for free.
- **"action" CardType** (`registries/definitions/actionCardType.ts`,
  `metadata.action = { label, jobId, jobParams }`) — the whole Card *is* one
  calibrated button (`ActionCardView.tsx`): clicking it runs the job directly, a
  gear icon in the header (occupying the same leading "+"-slot as other types'
  type-specific action) opens the calibration UI (`ActionCardEditor.tsx`), which
  reuses the exact same `ActionJobFields.tsx` component the inline node's own
  config popover already uses — no duplicated job-picker logic.
- **"prompt" CardType** (`registries/definitions/promptCardType.ts`,
  `metadata.prompt = { input, output }`) — a self-contained input box whose AI
  response streams back into the *same* Card, below the input, rather than
  creating a new sibling Card the way every other generation in the app does.
  Needed **zero backend changes**: it reuses the existing
  `/api/generate/stream/:pageCardId?instruction=&standalone=1` endpoint (already
  built for the pre-existing `promptCard` *action job*'s "on its own" context
  mode), consumed by a new lean client hook (`usePromptGeneration.ts`) that
  flattens the `CardBlockEvent` SSE stream into plain accumulated text instead of
  building the full `GhostCardNode` tree, then persists it onto this Card via
  `cardStore.editCard` (extended to accept a `metadata` patch, not just
  title/content) once done. Distinct from the identically-named `promptCard`
  *job* — flagged in code comments to avoid confusion between the two.
- Both types are creatable via the Feed Input Button's card-type picker, which
  was previously cosmetic for every type except Stack (selecting a type just
  highlighted it — nothing else happened); "Action"/"Prompt" now special-case the
  same way "Stack" already did, each calling a new `App.tsx` handler
  (`handleAddActionToCurrentPage`/`handleAddPromptToCurrentPage`) that creates the
  Card with the right `typeId`/default metadata via the existing
  `addNewCardToPage(..., metadata)` overload (which already accepted an arbitrary
  metadata override — it just had no caller using it for a new type before this).

## 4. Hide/Show

The reveal machinery — `metadata.hidden`, the Dock's "reveal hidden cards" eye
toggle, `PageStack.tsx`'s render-skip gate, and the dashed-border CSS for a
revealed-but-hidden Card — was all already built (Step "Apps", `revealHidden`
state) but nothing in the app could actually *set* `metadata.hidden` in the first
place. Added a "Hide"/"Show" action to the Dock's `selectedCards` row
(`operationId: null` — deliberately ungated by `supportsOperations`, since hiding
is meant to work uniformly across every CardType, not just ones that support
`card.rename`): flips `metadata.hidden` on every selected Card at once via
`cardStore.editCard` (no new backend endpoint — this already round-trips through
the generic `card.rename` Operation). Reads "Show" once every selected Card is
already hidden, "Hide" otherwise (a mixed selection defaults to "Hide", hiding the
rest too). Deselects afterward only when hiding *and* the reveal toggle is off, so
a Card that just visually vanished doesn't stay "selected" with the Dock showing
actions for something no longer on screen. New `eyeOff` icon (open eye + slash),
distinct from the pre-existing `eye` used by the reveal toggle itself.

## Files touched

**`packages/api`**: `src/routes/cards.ts` (`GET /:id/file`).

**`packages/shared`**: `src/registries/definitions/actionCardType.ts` (new),
`src/registries/definitions/promptCardType.ts` (new), `src/registries/init.ts`
(registers both), `src/registries/cardMetadata.ts` (`action`, `prompt` metadata
sub-fields), `src/index.ts` (exports).

**`packages/web`**: `src/components/Card/types/file/FileView.tsx` (PDF/Markdown
rendering, header, fullscreen), `src/components/Card/Card.css` (badge/PDF/
markdown/table/code-block styling), `src/components/Card/Card.tsx` (`onRequestRemove`,
header-action ordering), `src/components/Card/types/stack/{StackBody,StackView,
StackEditor}.tsx` (duplicate "+" removed, `onRequestRemove` wiring),
`src/components/PageStack/PageStack.tsx` (`onRequestRemove`/`onRunActionJob`/
`generatingPageCardId` threaded generically), `src/registries/cardTypeUi.ts`
(new optional props), `src/components/Dock/Dock.tsx` (removed actions, reordering,
Hide/Show action, `allSelectedHidden`), `src/components/primitives/Icon.tsx`
(`eyeOff`, plus icons used by the action/prompt picker tiles), `src/App.tsx`
(`handleRequestRemovePageCard`, `handleAddActionToCurrentPage`,
`handleAddPromptToCurrentPage`, `handleToggleHiddenSelected`, removed
`handleRemoveSelected`/`handleCloseStack`/`handleDeleteStack`/`handleConvertToStack`),
`src/components/FeedInputButton/FeedInputButton.tsx` (`onAddAction`/`onAddPrompt`),
`src/components/Card/types/action/{ActionCardView,ActionCardEditor,
ActionCardPickerTile}.tsx` + `ActionCard.css` (new), `src/components/Card/types/
prompt/{PromptCardView,PromptCardEditor,PromptCardPickerTile,PromptCardBody}.tsx` +
`PromptCard.css` (new), `src/hooks/usePromptGeneration.ts` (new), `src/lib/
cardStore.ts` (`editCard` accepts a `metadata` patch), `src/i18n/en.json`.

## Known limitations / deliberate scope cuts

- No UI path left to permanently delete an entire Stack (all alternates + their
  vault Cards) — only closing (detaching, promoting unsaved work) is reachable.
- No UI path left to remove a single Stack alternate without closing the whole
  Stack.
- Bulk-removing several selected Cards via the Dock is gone — removal is strictly
  one-Card-at-a-time via each Card's own "X" now.
- Table row/column add/delete buttons still don't exist (Step 13's own cut,
  unrelated to this step's header work).
- Action/Prompt CardType Editors write straight through on every keystroke/change
  (no draft/Save step) — consistent with how embeds and Dock Cards already behave,
  but means a not-yet-saved-to-vault Action/Prompt Card's calibration/input is live
  immediately, not staged.

## Verified

`tsc --noEmit` and `vite build`/`tsc` build clean across all three packages after
every change in this step. Not verified in a running browser.

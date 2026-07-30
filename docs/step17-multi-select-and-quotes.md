# Step 17 — Card Multi-Select and Text Quotes, Driven Entirely from the Dock

Selection in this app used to mean exactly one thing at a time: one Page Card
selected, full stop (Selection Lock, [step9](./step9-interaction-overhaul.md)). This
step generalizes it — several Cards can be selected at once, alongside any number of
highlighted spans of text ("Quotes") — and uses the combined set as context for the
Dock's own prompt panel (built in [step16](./step16-prompt-card-rework.md)).

This arc went through several iterations before landing on the design below,
including a floating popup anchored to the text selection and a separate per-Card/
per-highlight popup menu — both replaced once the interaction settled entirely into
the Dock. None of the intermediate floating-popup components exist in the final code;
this doc describes only the shipped design.

## Multi-select Cards

- **`packages/web/src/App.tsx`** — `toggleSelectPageCard` now toggles a Card's own
  membership in `selectedPageCardIds`: a tap adds it if absent, removes it (via
  `exitEditPageCard`, so it drops out of `editingPageCardIds` too if it was mid-edit)
  if present. Previously a second tap either did nothing or jumped into editing;
  editing is now reached only via double-click/long-press, unchanged from before.
- Every Dock bulk action — Save, Hide/Show, Move — already looped over
  `selectedCards` and needed no changes to support more than one. **Remove** is new:
  a Card's header no longer has a destructive "X" button at all (only a `+` for
  type-specific actions and a fullscreen toggle remain there); removing a Card from
  the Page is now exclusively the Dock's own bulk "Remove" action
  (`onRemoveSelected`/`App.tsx`'s `handleRemoveSelected`), operating on the whole
  selection at once.
- Actions that fundamentally need exactly one target — the rewrite-in-place magic
  button ([step15](./step15-rewrite-in-place.md)), a selected Stack's own "append a
  new alternate" generation, the pre-existing diff/footnote/highlight
  `ProcessPicker` — all gate on `selectedCards.length === 1` and simply disappear
  from the row once a second Card joins the selection, rather than trying to
  generalize.

## Quotes: confirmed text selections, not raw drag-selections

Dragging across text does **not** by itself add anything to the selection — it only
updates a lightweight "live selection" store
(`packages/web/src/lib/liveSelectionRegistry.ts`, fed by one document-level
`selectionchange` listener, `hooks/useGlobalSelectionTracking.ts`) that drives nothing
visually on its own. The Dock's own action row shows a quotation-mark "Quote" button
(reusing the existing `blockquote` icon glyph — two curling quote marks) whenever that
live selection is non-empty; only clicking it turns the selection into a persistent
**Quote** (`packages/web/src/lib/quotesRegistry.ts`'s `addQuote`). This two-step
"select, then explicitly confirm" design is deliberate: an earlier version committed
straight off the live drag, which (a) recomputed a ProseMirror decoration on every
single character selected — visibly janky — and (b) meant idly dragging across text
while reading silently added it to the AI context.

Several Quotes can coexist, even multiple within the same Card. Each renders as a
translucent, Kindle-style highlight via a dedicated ProseMirror decoration extension:

- **`packages/web/src/components/Card/richtext/SelectionHighlightDecoration.ts`** —
  deliberately a separate, much simpler plugin from the pre-existing persisted-
  annotation-highlight system (`AnnotationDecorations.ts`): Quotes are never
  persisted (plain in-memory state, gone on reload — same as `selectedPageCardIds`),
  never have footnote/run-merging logic to worry about, and render in *both* read and
  edit mode (annotations hide while editing; a Card can be part of the Dock's
  selection either way now).
- **`AnnotatedText.css`**'s `.selection-highlight` — a translucent wash using
  `--color-highlight` (an existing, already Kindle-esque gold token). The same token
  now also washes a selected Card's own background
  (`primitives/CardShell.css`'s `.card-shell--selected`), so a Quote and a selected
  Card read as the same "part of the current selection" treatment. The live native
  browser `::selection` color is set to match too (`CardRichText.css`), so there's no
  visible clash between the browser's own selection painting and the persistent
  decoration during the brief moment both are present.

Clicking an *existing* Quote's highlight doesn't open a popup either — it "targets"
that one Quote (`packages/web/src/lib/targetedQuoteRegistry.ts`, at most one at a
time), rendered with a stronger `.selection-highlight--targeted` style so it's
visually obvious which one is targeted. The Dock's row then shows a "Deselect quote"
(X) action for it — clicking that is what actually removes it
(`quotesRegistry.ts`'s `removeQuote`).

## Selecting a Card requires its "blank space" — text is always just highlightable

`CardRichText`'s own container stops click propagation
(`onClick={(e) => e.stopPropagation()}`) — so a click or drag anywhere inside a
Card's rendered text content never bubbles up to that Card's own click-to-select
handler. Selecting a Card now requires clicking its header/margins (the "blank
space"), while text stays freely highlightable wherever it renders — including
nested inside embeds, since the fix is centralized in `CardRichText` rather than
duplicated per call site. (A side effect: an embedded Card's own click-to-select,
which previously fired from a click anywhere in its box including its text, now also
requires its header/margin — consistent with the same principle, not special-cased
back to the old behavior.)

## The Dock's prompt panel: additive, not exclusive

`Dock.tsx`'s lookup/prompt panel (built in [step16](./step16-prompt-card-rework.md))
sits **above** the base action row rather than replacing it — an early iteration
swapped out the row's own content entirely while the panel was open, which meant
losing access to the WYSIWYG formatting toolbar (or any other Dock action) while a
selection was active. It now shows automatically whenever anything is selected — one
or more Cards, one or more Quotes, or just a live (not-yet-confirmed) selection, to
surface the Quote button — without touching whatever the row underneath is already
showing.

The panel shows a plain status line — `"N words, N cards, N quotes"` — computed from
every selected Card's own plain-text content plus every Quote's text, and its ask box
sends that same combined content as context to the quick-lookup endpoint
([step16](./step16-prompt-card-rework.md)'s `streamSelectionLookup`) — not just a
single highlighted span the way the very first version of this feature worked.

## Files touched

**`packages/web`**: `src/lib/{quotesRegistry.ts,liveSelectionRegistry.ts,
targetedQuoteRegistry.ts}` (new), `src/hooks/useGlobalSelectionTracking.ts` (new),
`src/components/Card/richtext/{SelectionHighlightDecoration.ts,CardRichText.tsx,
CardRichText.css,extensions.ts}`, `src/components/Card/{Card.tsx,AnnotatedText.css}`,
`src/components/Card/types/{file/FileView.tsx,action/ActionCardView.tsx,prompt/
PromptCardView.tsx,stack/{StackView.tsx,StackBody.tsx,StackEditor.tsx}}`,
`src/registries/cardTypeUi.ts`, `src/components/PageStack/PageStack.tsx`,
`src/components/primitives/{CardShell.tsx,CardShell.css}`, `src/App.tsx`
(`toggleSelectPageCard`, `handleRemoveSelected`), `src/components/Dock/
{Dock.tsx,Dock.css}` (large — bulk Remove, Quote/Deselect-quote row actions, the
additive lookup panel, word/card/quote summary), `src/i18n/en.json`.

## Known limitations

- No keyboard-accessible way to trigger the Quote action — it's mouse/touch drag +
  click only, same as the pre-existing diff/footnote/highlight SelectionMenu.
- Quotes are never persisted, by design — reloading or navigating away loses them,
  same as the rest of the selection state.
- The pre-existing diff/footnote/highlight `ProcessPicker`/`SelectionMenu` is a fully
  separate system from Quotes (different anchor-matching, different persistence
  model) — the two can coexist on the same selected text without conflicting, but
  don't share any state.
- No bulk "clear just the Cards" or "clear just the Quotes" action distinct from
  dismissing the whole panel (which clears Quotes) or deselecting Cards one at a time.

## Verified

`tsc --noEmit` and `vite build` clean across all four packages after every change in
this step, including after diagnosing and fixing a stray null byte an earlier tool
edit had silently embedded in `CardRichText.tsx` (it was byte-for-byte invisible in
normal reads but broke further string-based edits against that file until found via
direct byte inspection). Not exercised in a running browser.

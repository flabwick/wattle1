# Step 16 — Prompt Card Rework: Flip Mechanic, Iteration History, Context Modes

The "prompt" CardType (a self-contained input/output box, added in
[step14](./step14-cards-and-polish.md)) only ever held a single `{input, output}`
pair, rendered its output as escaped plain text, and had no way to control what
context — if any — its generation could see. This step reworks all three.

## Flip card, not overwrite-in-place

The Card now has a front face (the prompt input + context settings) and a back face
(the active iteration's rendered output + a small history rail), toggled with a CSS
3D flip (`rotateY`, both faces grid-stacked into the same cell so the container sizes
to the taller of the two rather than clipping). Sending a prompt no longer overwrites
the previous output — it **appends** a new iteration and flips to show it, so earlier
answers stay reachable. The back face's rail (`prev`/`n of total`/`next`) mirrors
`CardStackRail.tsx`'s own convention exactly, reusing its rotated-chevron CSS trick
rather than adding dedicated icons.

`cardMetadata.ts`'s `prompt` field is reshaped accordingly: `{input, iterations:
[{input, output, createdAt}], activeIndex, context: {mode, cardIds}}`. The old
`{input, output}` shape still parses (zod defaults fill in the new fields), so no
migration script was needed.

## Real rich text, not escaped plain text

The model already produces the app's restricted rich-text tag set (`<p>`, `<strong>`,
etc. — the same contract every other generation in the app follows) even for a Prompt
Card's output; the original implementation just rendered that HTML as literal escaped
text instead of interpreting it. The back face now renders each iteration's output
through `CardRichText` in read-only mode, the same component (and the same
`SelectionHighlightDecoration`/Quote system — see
[step17](./step17-multi-select-and-quotes.md)) every other Card's content goes
through.

## Four context modes, not always-empty

A Prompt Card's generation previously always ran with zero context ("standalone").
It now has an explicit picker — **page**, **tab**, **specific cards**, or **none**
(the old default) — deliberately *not* the directional "Generation Rule" every other
generation in the app follows (only what's "above" a trigger point): "page"/"tab"
here mean *every* Card on the current Page/Tab regardless of position, since a Prompt
Card is asking a question about its surroundings, not continuing from a fixed point
within them.

- **`packages/shared/src/types.ts`** — `PromptCardContextMode` (`"page" | "tab" |
  "cards" | "none"`), shared between client and server.
- **`packages/api/src/services/generationService.ts`** — `assemblePromptCardContext`
  (the new non-directional assembler) and `streamPromptCardGeneration`, both
  independent of the existing `assembleContextForTarget`/Generation Rule path. Reuses
  the "interactive" prompt mode (the typed prompt is an override instruction) against
  whichever context this assembles instead of the fixed directional context every
  other generation gets.
- **`packages/api/src/routes/generate.ts`** — new `GET /api/generate/stream/
  prompt-card/:pageCardId?input=&contextMode=&contextCardIds=`.
- **`packages/web/src/components/Card/types/prompt/ContextCardPicker.tsx`** — the
  "specific cards" mode's multi-select popover, a sibling of the pre-existing
  `CardLinkPicker.tsx` (same vault-wide search-as-you-type list) but with checkboxes
  and a "Done" footer instead of select-and-close.

A refactor split `generationService.ts`'s old `streamForTarget` into a shared
`streamCompiledPrompt` tail (provider call + `CardBlockParser` loop) so this new path,
the pre-existing one, and the quick-lookup path below all reuse the same plumbing
instead of duplicating it.

## The text-selection quick lookup — reusing a dormant prompt mode

`packages/prompt-engine/src/promptCompiler.ts` had a `"selection"` prompt mode
scaffolded since an earlier step, never actually wired to any caller. This step wires
it up for a new capability: a text selection can be sent to the model on its own, with
an optional custom instruction, defaulting to a plain-language clarification when
none is given. The selection prompt's own system prompt (`prompts/selection/
system.md`) was rewritten to bias toward brevity — this is meant to be a quick lookup,
not a full generation.

- **`packages/api/src/services/generationService.ts`** — `streamSelectionLookup`,
  context always empty (a lookup is deliberately self-contained, no surrounding
  Page/Tab content).
- **`packages/api/src/routes/generate.ts`** — new `GET /api/generate/stream/lookup?
  text=&instruction=`. Registered *before* the existing `/stream/:pageCardId` route:
  both are single-path-segment patterns, and Express matches registration order, so a
  literal `/stream/lookup` would otherwise be swallowed by that earlier wildcard
  (`pageCardId="lookup"`) and never reach this one — caught and fixed during this
  step.
- **`packages/web/src/hooks/useSelectionLookup.ts`** — a lean SSE consumer (sibling of
  `usePromptGeneration.ts`): accumulates `text` events into one HTML string, never
  calls `POST /accept`.

Where this ended up living in the UI (originally a floating popup, now folded into the
Dock alongside Quotes) is covered in
[step17](./step17-multi-select-and-quotes.md) — this step only covers the backend
capability and the Prompt Card itself.

## Files touched

**`packages/shared`**: `src/types.ts` (`PromptCardContextMode`), `src/registries/
cardMetadata.ts` (`prompt` reshaped).

**`packages/prompt-engine`**: `src/promptCompiler.ts` (`SelectionModeInput.instruction`),
`prompts/selection/system.md` (rewritten).

**`packages/api`**: `src/services/generationService.ts` (`streamCompiledPrompt`
extraction, `assemblePromptCardContext`, `streamPromptCardGeneration`,
`streamSelectionLookup`), `src/routes/generate.ts` (two new routes).

**`packages/web`**: `src/hooks/usePromptGeneration.ts` (context-mode params, HTML
accumulation), `src/hooks/useSelectionLookup.ts` (new), `src/components/Card/types/
prompt/{PromptCardBody.tsx,PromptCard.css,ContextCardPicker.tsx,ContextCardPicker.css}`
(new/rewritten), `src/i18n/en.json`.

## Known limitations

- Iteration history is unbounded — nothing prunes old iterations, so a heavily-reused
  Prompt Card's `metadata.prompt.iterations` array only ever grows.
- The "cards" context mode's picker searches the whole vault, not scoped to the
  current Page/Tab — deliberate (more flexible), but means picking context from a
  large vault requires typing to filter.
- Still only ever produces the app's restricted rich-text tag set (no tables, images,
  etc.) — same ceiling every other generation in the app has.

## Verified

`tsc --noEmit` and `vite build` clean across all four packages. Not exercised in a
running browser.

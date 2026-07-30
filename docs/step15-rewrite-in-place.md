# Step 15 — Rewrite-in-Place (the Dock's Magic Button on a Selected Card)

Before this step, the Dock's magic button always did the same thing regardless of
context: generate new content and insert it as a new sibling Card. Selecting a single
plain Card and hitting the magic button now does something different — it redoes
*that Card's own content in place*, via the existing diff annotation system, instead
of creating anything new.

## The flow

Tapping the magic button while exactly one plain (non-Stack) Card is selected no
longer generates immediately. It opens an inline text box in the same Dock row
(`[back] [textbox] [send]`, replacing the row's normal selectedCards actions the same
way the rich-text formatting toolbar replaces it while editing) — you can type a
guiding instruction, or leave it blank. Tapping the send button runs an **instructed**
diff: the model proposes anchor/replacement edits against the Card's own content,
landing as ordinary pending diffs, reviewed through the exact same UI every other diff
already uses (inline strike-through/replacement markers, `DiffPopover`'s per-entry
accept/reject, the Dock's own "Accept all diffs" action once any are pending).

A selected Stack keeps its own separate, pre-existing "append a new alternate"
generation — untouched by this.

## Reusing (not replacing) the diff process

The existing "diff" annotation process (`prompts/diff/system.md`) is deliberately
narrow: it only ever flags genuine spelling/grammar errors, never rewrites for style
or instruction. Rather than building a parallel process, this extends the same one:

- **`packages/prompt-engine/src/annotationCompiler.ts`** — `CompileAnnotationInput`
  gained an optional `instruction`. When present (and the process is `"diff"`), a new,
  broader system prompt loads instead of the default one — **`packages/prompt-engine/
  prompts/diff/system-instructed.md`** — which explicitly permits following the user's
  instruction (rewrite wording, restructure, add/remove detail) while still only ever
  expressing changes as anchor/replacement diffs, never freestanding new content. A
  blank instruction (the box left empty) falls straight back to the original
  proofread-only prompt — same annotation type, same review UI, two prompts.
- **`packages/api/src/services/annotationService.ts`** — `runAnnotationProcess`/
  `callModel` thread `instruction` through to `compileAnnotationPrompt`.
- **`packages/api/src/routes/annotations.ts`** — `POST /api/annotations/run` reads an
  additional `instruction` field off the request body.
- **`packages/web/src/api/client.ts`** / **`hooks/useAnnotations.ts`** — `
  runAnnotationProcess`/`runProcess` gained the same optional trailing parameter.

## Frontend wiring

- **`packages/web/src/App.tsx`** — `handleRewriteSelected(instruction)` resolves the
  single selected Card/PageCard and calls `handleRunProcess(cardId, "diff", undefined,
  pageCardId, instruction)` — the same function the Dock's pre-existing
  diff/footnote/highlight `ProcessPicker` already used, just with an instruction now
  riding along.
- **`packages/web/src/components/Dock/Dock.tsx`** — local `rewriteBoxOpen`/
  `rewriteText` state. The row's `generateSelected` action is only shown at all when
  `selectedCards.length === 1` (and not a Stack) — hidden entirely once a second Card
  joins the selection, since a diff fundamentally needs one definite target to anchor
  against. (This scoping decision was later reaffirmed when the general multi-select
  system was built — see [step17](./step17-multi-select-and-quotes.md).)

## Files touched

**`packages/prompt-engine`**: `src/annotationCompiler.ts`, `prompts/diff/
system-instructed.md` (new).

**`packages/api`**: `src/services/annotationService.ts`, `src/routes/annotations.ts`.

**`packages/web`**: `src/api/client.ts`, `src/hooks/useAnnotations.ts`, `src/App.tsx`
(`handleRewriteSelected`), `src/components/Dock/Dock.tsx` (`rewriteBoxOpen` row,
`generateSelected` action's single-Card gating), `src/i18n/en.json`.

## Known limitations

- Still fundamentally a diff process — can only express changes as anchor/replacement
  pairs against existing text, not a true wholesale restructure (a large rewrite
  becomes several smaller diffs rather than one clean pass).
- No context beyond the Card's own content — unlike the Prompt Card's later context
  modes ([step16](./step16-prompt-card-rework.md)), a rewrite never sees surrounding
  Page/Tab content.

## Verified

`tsc --noEmit` and `vite build` clean across all four packages. Not exercised in a
running browser.

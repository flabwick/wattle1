# Prompts

Every system prompt this app sends to a model lives here as a plain markdown file,
loaded fresh off disk at the moment it's used (see `../src/promptsDir.ts` for the
shared path-resolution logic every compiler below imports) — editing one of these
files changes model behavior on the very next call, with no rebuild or restart.

**If you're adding a new CardType, Operation, or action job**, see
[`docs/adding-features.md`](../../../docs/adding-features.md) at the repo root for
the checklist of which of these files typically need a look. Nothing here enforces
that these files stay accurate as the app grows — the `generate/system.md`,
`diff/system.md`, `footnote/system.md`, and `highlight/system.md` prompts in
particular describe the app's own content model (Cards, their formatting, what a
model may reference) in plain English, and a structural change elsewhere in the
codebase can silently make one of them wrong.

This app has six small, independent prompt-compiling systems, each with its own
subfolder(s) below and its own compiler in `../src/`. They don't share an output
contract with each other — see each section's own description.

## Generation modes (`src/promptCompiler.ts`)

One subfolder per trigger mode (`PromptMode` in `src/promptCompiler.ts`):

| File | Loaded by | Used for |
| --- | --- | --- |
| `generate/system.md` | `compilePrompt({ mode: "generate", ... })` | The default per-Card generation triggered by the Feed Input Button's Circle action (or the Dock's Generate action on a selected Card). |
| `selection/system.md` | `compilePrompt({ mode: "selection", ... })` | A sub-generation scoped to a highlighted/selected span of text inside a Card. Compiler support only for now — no UI trigger wired up yet. |
| `interactive/system.md` | `compilePrompt({ mode: "interactive", overridePrompt, ... })` | A generation whose trigger supplies an override instruction instead of being generated from ordinary surrounding context alone. Wired up: the Feed Input Button's expanded text field sends whatever's typed as `overridePrompt` when Circle is tapped (`generationService.ts`'s `streamForTarget`). |

All three share the same output contract: the response is exactly one root
`<card type="..." title="...">...</card>` block, which may contain any number of nested
`<card>...</card>` blocks at any depth for sub-points. See
`src/parsers/cardBlockParser.ts` for the stream parser that consumes this format.

**A card's own content** (root or nested) is plain text plus, at most, a fixed
allowlist of HTML formatting tags — `<p>`, `<strong>`, `<em>`, `<h1>`–`<h3>`, `<ul>`,
`<ol>`, `<li>` — no attributes, no other tags, and no markdown syntax as an
alternative to them (see `generate/system.md`'s rule 6 for the full wording, and
`packages/shared/src/richText/` for the TipTap schema this gets parsed through — a
Card's stored `content` is HTML, not markdown; anything outside this allowlist is
silently dropped, not rendered). A nested reference to an existing Card is
`<wattle-embed data-card-id="...">` (spliced in server-side by
`generationService.ts`'s `materializeParts`), never something the model emits itself
— the old `[[cardId]]` bracket-token format is gone.

**These prompts do not currently tell the model which CardTypes exist** —
`generate/system.md`'s rule 4 just says `type` should be `"note"` "unless you have a
specific reason to use another registered card type," without naming any. If you add
a CardType you want a generation to be able to pick deliberately (rather than only
ever defaulting to `"note"`), you need to add it to that rule yourself — the prompt
has no auto-generated list to fall out of sync, because it doesn't generate one at
all yet.

### Adding a new generation mode

1. Create `<mode>/system.md` here.
2. Add the mode to `PromptMode` and `SYSTEM_PROMPT_FILE` in `src/promptCompiler.ts`.

## Annotation processes (`src/annotationCompiler.ts`) — a separate, parallel system

| File | Loaded by | Used for |
| --- | --- | --- |
| `diff/system.md` | `compileAnnotationPrompt({ process: "diff", ... })` | Proposing text replacements (spelling/grammar) on existing Card content — the default, narrow, proofread-only behavior. |
| `diff/system-instructed.md` | `compileAnnotationPrompt({ process: "diff", instruction: "...", ... })` | The same "diff" process, but with a non-blank `instruction` (the Dock's magic-button rewrite-in-place flow) — a broader instructed rewrite, still only ever proposing anchor/replacement diffs, never freestanding new content. |
| `footnote/system.md` | `compileAnnotationPrompt({ process: "footnote", ... })` | Attaching plain-text clarifying notes to existing Card content. |
| `highlight/system.md` | `compileAnnotationPrompt({ process: "highlight", ... })` | Marking notable spans of existing Card content, with an optional note. |

These do not use the `<card>` block contract above — they never re-emit or rewrite Card
content, only a JSON array of sparse `{cardId, anchor, ...}` entries anchored to an exact
substring of the target content (dropped silently if the anchor doesn't match). See
`src/annotationCompiler.ts` and `src/annotationParser.ts`.

### Adding a new annotation process

1. Create `<process>/system.md` here.
2. Add the process to `AnnotationProcess` and `SYSTEM_PROMPT_FILE` in
   `src/annotationCompiler.ts`.

## Summary (`src/summaryCompiler.ts`) — a separate, small system

| File | Loaded by | Used for |
| --- | --- | --- |
| `summary/system.md` | `compileSummaryPrompt(plainTextContent)` | The Nearby system's per-Card summary maintenance (`summaryService.ts`) — one or two plain sentences, no structured output at all. |

No mode/process argument — there's only ever one summary prompt, so
`compileSummaryPrompt` takes no selector, just the Card's own plain-text content.

## Extract (`src/extractionCompiler.ts`) — a separate, small system

| File | Loaded by | Used for |
| --- | --- | --- |
| `extract/system.md` | `compileExtractionPrompt(instructions?)` | The "file" CardType's own text-extraction/OCR buttons (`FileView.tsx`, `packages/api/src/services/fileExtractionService.ts`) — transcribes one page image verbatim, nothing structured. |

Also no mode/process argument, same shape as Summary above — the only variable input
is an optional user-typed `instructions` string, spliced into the compiled user
message rather than the system prompt itself (see `extractionCompiler.ts`). This is a
one-shot vision call, not the tool-calling/agent-loop machinery below —
`src/providers/openRouterVision.ts` sends it directly to OpenRouter rather than going
through `ModelProvider`/`generateWithTools`.

## Action script (`src/actionScriptCompiler.ts`) — mostly-static, one dynamic section

| File | Loaded by | Used for |
| --- | --- | --- |
| `action-script/system.md` | `compileActionScriptPrompt({ actionsDoc, instruction, currentScript? })` | The "action" CardType's own "Generate steps with AI" feature (`packages/web/src/lib/actionScriptJob.ts`) — teaches a model to write Wattle's small action-script language (see `packages/web/src/lib/actionScript.ts`'s own doc comment for the language itself). |

Unlike every other prompt above, this one is **not entirely static markdown**: the
`ACTIONS` section (documenting every runnable action-job the model can use) is
rendered client-side, from the live `actionJobRegistry` in `@wattle/web` — a
browser-only module this server-side package can't import — and passed in as
`actionsDoc`, which `compileActionScriptPrompt` splices into this file's own
`<!-- ACTIONS -->` placeholder. Editing the rest of `action-script/system.md`
(the syntax rules, the Variables explanation, the example) works exactly like every
other prompt here — no rebuild needed. But **adding a new action job never requires
editing this file** — see `registries/README.md`'s own "Adding a new action job"
section (`packages/shared/src/registries/README.md`) for why that part auto-syncs.

## Agent (`src/agentCompiler.ts`) — native tool-calling, no output contract at all

| File | Loaded by | Used for |
| --- | --- | --- |
| `agent/system.md` | `compileAgentTurn({ scope, instruction, contextText })` | The Brilliantly Simple Generation Agent: Feed/Circle with typed guide text, and selection "Ask AI", both run a small client-side tool-calling loop (`@wattle/web`'s `useAgentLoop.ts`) instead of streaming a `<card>` block. |

Structurally the simplest system here: **entirely static markdown, no placeholder, no
splice.** The agent's tool vocabulary (one entry per runnable action-job, the same
`actionJobRegistry` `action-script/system.md` draws from) travels as a real `tools`
array on the provider request — native tool-calling — not as prose baked into the
system prompt, so unlike `action-script/system.md` there's no `ACTIONS`-style section
to keep in sync here at all. `compileAgentTurn` only builds the *first* turn's user
message (a scope line + the instruction + whatever page/selection context the client
assembled); every turn after that reuses the same `system` string with its own
`messages` array (the running tool_use/tool_result conversation) instead of calling
this compiler again — see `packages/api/src/services/agentService.ts`.

### Adding a new generation mode / process / system

Same short version across all six systems above: add a new `<name>/system.md` file
here, then add the corresponding entry to that system's own compiler in `../src/`
(`PromptMode`/`SYSTEM_PROMPT_FILE`, `AnnotationProcess`/`SYSTEM_PROMPT_FILE`, or a new
compiler module entirely for a structurally different system, as `agentCompiler.ts`/
`extractionCompiler.ts` were here). None of these six compilers know about each other.

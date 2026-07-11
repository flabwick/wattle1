# Step 8 — AI Generation: Prompts, Streaming, Ghost Cards

Replaces the Step 2/3 scaffolding (a flat prompt template, a preview-only SSE stream,
and a non-streaming persist call that re-ran the model) with the real generation
pipeline: file-based prompts with an explicit output contract, a single streaming
model call per generation, a stack-based parser for nested card blocks, and a
frontend review step (ghost card → accept/deny) before anything is persisted.

Out of scope, deliberately: the edit/diff generation mode, and any schema change —
`Card`/`Page`/`PageCard` are untouched throughout.

## Prompts directory (`packages/prompt-engine/prompts/`)

Every prompt sent to a model is a plain markdown file, loaded fresh off disk on every
call (`src/promptCompiler.ts`'s `loadSystemPrompt`) — editing a `.md` file changes
model behavior on the next generation, no rebuild or restart. See
[`prompts/README.md`](../packages/prompt-engine/prompts/README.md) for the full list.

Three trigger modes, one subfolder each — `generate/`, `selection/`, `interactive/` —
though only `generate` is wired to an actual caller today; the other two exist so
their triggering UI (highlight-to-generate, an interactive override card) can be
added later without restructuring the compiler.

All three commit the model to the same **output contract**, spelled out in each
`system.md`: the entire response is exactly one root
`<card type="..." title="...">...</card>` block, which may itself contain any number
of nested `<card>` blocks at any depth for sub-points. No text outside the root card;
every opened tag must be closed.

## Prompt compiler (`packages/prompt-engine/src/promptCompiler.ts`)

`compilePrompt(input)` replaces the old `promptTemplateRegistry`/`"generate-from-context"`
template (removed — `src/templates/index.ts` is gone). Produces
`{ systemPrompt, userMessage }`: the system prompt is the mode's `system.md` above;
the user message is the assembled context in the existing directional "everything
above, nothing below" form (`generationService`'s context assembly is unchanged),
plus, for `selection`/`interactive`, that mode's extra input.

## Model config (`packages/api/config/model.config.json`)

```json
{
  "activeProvider": "openrouter",
  "providers": {
    "stub": { "model": "stub", "temperature": 0.7, "maxTokens": 4096 },
    "anthropic": { "model": "claude-opus-4-8", "temperature": 0.7, "maxTokens": 4096 },
    "openrouter": { "model": "claude-sonnet", "temperature": 0.7, "maxTokens": 4096 }
  }
}
```

Read fresh on every call (`packages/api/src/modelConfig.ts`) — no restart needed to
change provider, model, temperature, or max tokens. `activeProvider` here takes
priority over `providers/init.ts`'s old env-var-based `activeProviderId()` logic
(`MODEL_PROVIDER`, then whichever of `OPENROUTER_API_KEY`/`ANTHROPIC_API_KEY` is set),
which still runs as the fallback when the config file doesn't name one.

`providers.<id>.model` accepts either a `ModelRegistry` id (e.g. `"claude-sonnet"`) or,
for `openrouter`, a raw OpenRouter model slug directly (e.g.
`"deepseek/deepseek-chat"`) — `openRouterProvider.resolveModel` falls back to using an
unrecognized id verbatim, so trying a different OpenRouter model doesn't also require
a matching `models/definitions/*.ts` entry.

`temperature`/`maxTokens`/`model` are threaded through as `opts` on
`ModelProvider.generate(prompt, opts)` — previously accepted but never used, now
actually consumed by `anthropicProvider` and `openRouterProvider` (`systemPrompt` goes
through the same `opts` object, as an Anthropic `system` param / an OpenAI-style
`system`-role message respectively).

**Credentials are unchanged** — `OPENROUTER_API_KEY` is read through the same
`getCredential()` every other provider key uses, sourced from `packages/api/.env`. No
new credential-reading path was added.

## Card block parser (`packages/prompt-engine/src/parsers/cardBlockParser.ts`)

`CardBlockParser` incrementally parses the output contract's `<card>` markup as text
streams in. Stack-based: `open` pushes a frame (with a unique `id` and its `parentId`,
or `null` for the root), `close` pops one, `text` always reports which `id` it belongs
to. Tags split across chunk boundaries (arbitrary chunk sizes from the provider) are
buffered until the rest arrives. Emits `open`/`text`/`close`/`done`/`error` events —
`error` covers a mismatched close tag, a second root-level `<card>`, or the stream
ending with an unterminated block.

## Collapsed to one model call

- `GET /api/generate/stream/:pageCardId` (card selected) and the new
  `GET /api/generate/stream/page/:pageId` (nothing selected — see below) are now the
  **sole** model invocation. Each compiles the prompt, calls the active provider once,
  and forwards `CardBlockParser` events as SSE (`data: {...}\n\n`). Nothing is
  persisted — these are still effectively read-only.
- The old `POST /api/generate` (which re-ran the model a second time to persist) is
  retired. `POST /api/generate/accept` replaces it: it accepts the **already-generated**
  title/content/cardType (parsed client-side from the SSE events) and persists it
  directly, with no model call. Wraps a new `card.generateAccept` Operation
  (`packages/api/src/operations/cardGenerateAccept.ts`), registered the same way as
  every other card mutation.
- A provider failure mid-stream (bad credentials, network error) is caught in the
  route and forwarded as one more SSE `error` event, rather than crashing into
  Express's JSON error handler after headers are already committed
  (`ERR_HTTP_HEADERS_SENT` — a real bug hit during manual testing with an invalid key).

### Generation targets: a selected Card, or nothing selected

`generationService.GenerationTarget` is `{ type: "card"; pageCardId }` or
`{ type: "page"; pageId }`:

- **Card selected** (existing behavior): context is everything above the trigger
  Card; the result is inserted directly below it, shifting later `PageCard`s down.
- **Nothing selected, a Page is in view** (new): the Dock's Generate action also
  shows here now. Context is everything already on that Page (plus every Page above
  it) — equivalent to a card-level trigger whose own order is past everything in the
  Page. The result is appended at the bottom, no shifting needed
  (`persistGeneratedCardToPage`).

Both share one context-assembly function (`assembleContextForTarget`) and one
streaming/parsing loop (`streamForTarget`) internally.

## Frontend: ghost card + Dock review state

- **`useGeneration.ts`** consumes the SSE events into local tree state only — nothing
  touches a Page or the vault while streaming. `start(pageCardId)` /
  `startForPage(pageId)` both record which `GenerationTarget` they're using, so
  `accept()` (no longer needs a parameter) and `deny()` know what to do without the
  caller re-passing it.
- **`GhostCard.tsx`** renders the root node with the same chrome (`CardShell`,
  `card__header`, `card__title`) a real Card uses, with a dashed-border
  `card-shell--ghost` modifier so it visibly reads as "not committed yet." Nested
  `<card>` blocks render as embedded sub-cards (`GhostCardEmbed`, styled like
  `CardEmbed.tsx`'s `[[cardId]]` embeds) — nesting is purely a rendering concern, the
  parts are re-serialized back into literal `<card>` markup inside the root's own
  `content` string on accept, never a separate DB row.
- **`PageStack.tsx`** renders the ghost card in the slot the real Card will land in
  once accepted: directly after a specific `PageCard` (`afterPageCardId` set), or at
  the very bottom of the Page (`afterPageCardId: null`, the "nothing selected" case).
- **`Dock.tsx`** gains a review state: once streaming finishes, the whole Dock
  collapses to just Deny/Accept (same pattern as Move Mode), and a dismissible
  `dock__error-banner` shows if the stream ended in an `error` event instead — a
  silent failure was an actual bug caught during manual testing (a bad OpenRouter key
  produced no visible feedback at all before this was added).
- The Generate action itself is gated on the new `card.generateAccept` Operation id
  (both server-side registration and the client-side id mirror in
  `registries/init.ts` — missing that update was another bug caught manually: the
  button silently didn't render because the client's operation-id mirror still said
  `"card.generate"`).

### A pre-existing CSS bug fixed along the way

`CardContent.css`'s `.card__preview--embedded` (un-clamps a Card's preview once it
has embedded content) lost the cascade to `Card.css`'s `.card__preview` (clamps to 3
lines) whenever the two stylesheets happened to load in the "wrong" order — which
`GhostCard.tsx`'s own CSS imports triggered, silently clipping nested ghost cards.
Fixed by raising the override's specificity to `.card__preview.card__preview--embedded`
so it wins regardless of load order — this also protects the pre-existing
`[[cardId]]`-embed rendering path from the same latent bug.

## Files touched

**`packages/prompt-engine`**: `prompts/` (new — `README.md`, `generate/system.md`,
`selection/system.md`, `interactive/system.md`), `src/promptCompiler.ts` (new,
replaces `src/templates/index.ts`, removed), `src/parsers/cardBlockParser.ts` (new),
`src/providers/openRouterProvider.ts`, `src/index.ts`, `README.md`.

**`packages/api`**: `config/model.config.json` (new), `src/modelConfig.ts` (new),
`src/services/generationService.ts`, `src/routes/generate.ts`,
`src/operations/cardGenerateAccept.ts` (new, replaces `cardGenerateOperation`, removed),
`src/operations/init.ts`, `src/providers/init.ts`, `src/providers/anthropicProvider.ts`,
`src/providers/stubProvider.ts` (now emits contract-wrapped output, so the no-credentials
dev path exercises the same parser everything else does).

**`packages/web`**: `src/hooks/useGeneration.ts` (rewritten), `src/api/client.ts`
(`acceptGeneration` replaces `generateFromPageCard`), `src/hooks/usePages.ts`,
`src/components/Card/GhostCard.tsx` (new), `src/components/PageStack/PageStack.tsx`,
`src/components/Dock/Dock.tsx` / `.css`, `src/components/Card/CardContent.css`,
`src/components/primitives/CardShell.css`, `src/registries/init.ts`, `src/App.tsx`,
`src/i18n/en.json`.

## Known limitations / deliberate scope cuts

- A persisted Card's `<card>` markup (from an accepted generation with nested blocks)
  does not render as embedded sub-cards outside the ghost/review phase — `Card.tsx`'s
  normal view still shows it as literal text. Rendering it post-accept the same way
  `GhostCard.tsx` does is a natural follow-up, not built here (the instructions scoped
  nested rendering to the review step specifically).
- `selection`/`interactive` prompt modes are compiler-addressable only — no
  highlight-to-generate or interactive-card UI trigger exists yet.
- Real-provider paths (`anthropic`, `openrouter`) were exercised end-to-end manually
  against a real OpenRouter key during this work, including the credential-loading
  bug below; `anthropic` itself was only verified by build/typecheck, not a live call.

## A credential-loading footgun (not a code bug, but worth documenting)

`getCredential()`/Prisma's `.env` auto-load only *adds* env vars that aren't already
set in `process.env` — it never overrides one that's already there. If
`OPENROUTER_API_KEY` (or any provider key) is also `export`ed in a shell profile
(`~/.zshrc` etc.), that shell-level value silently wins over whatever's in
`packages/api/.env`, with no error — the app just authenticates as whatever the old
exported value was. Symptom: a key that works via a direct `curl` to OpenRouter still
gets `401 Unauthorized` from the app. Fix is outside the repo (remove the shell
`export`, or `unset` it for the current session) — flagging here since it cost real
debugging time and isn't something `packages/api/.env.example` can warn about.

## Verified

- `npm run build` (shared → prompt-engine → api → web) — clean, no type errors.
- Manual end-to-end, both via `curl` against a live dev server and a headless-browser
  smoke test (Playwright driving the actual UI):
  - Card-selected generation: stream → ghost card → Accept persists it correctly below
    the trigger; Deny discards it with no server call.
  - Nested `<card>` block: renders as an embedded sub-card inside the ghost card during
    review; content (including the literal nested markup) persists correctly on accept.
  - "Nothing selected" page-level generation: Generate button appears with no Card
    selected, hits `GET /stream/page/:pageId`, ghost card renders at the bottom of the
    Page, Accept appends it there.
  - Editing `prompts/generate/system.md` and `config/model.config.json` both change
    behavior on the very next generation with no restart.
  - A provider error (invalid OpenRouter key) surfaces as a dismissible Dock banner
    instead of the stream silently doing nothing.
  - Existing non-generation card operations (create/edit/save/remove/delete, Move
    Mode) unaffected.

# Step 2 — ModelProvider Registry + Streaming + PromptEngine

Introduces a `ModelProviderRegistry` (in `@wattle/shared`, alongside Step 1's
`CardTypeRegistry` / `OperationRegistry`), a new `@wattle/prompt-engine` workspace
package for parsing/prompt-templates/credentials, and wires one real provider
(Anthropic) behind both the existing non-streaming generate flow and a new SSE
streaming endpoint. The existing `card.generate` Operation and `POST /api/generate`
keep their exact pre-Step-2 response shape — this step is additive.

See [`packages/prompt-engine/README.md`](../packages/prompt-engine/README.md) for how
to add a new Parser, PromptTemplate, or ModelProvider.

## What was added

- `packages/shared/src/registries/modelProvider.ts` — `Chunk`, `ModelProvider`,
  `ModelProviderRegistry`, singleton `modelProviderRegistry`.
- `packages/prompt-engine/` — new workspace package:
  - `src/parsers/index.ts` — `Parser`, `ParserRegistry`, singleton `parserRegistry`;
    one parser registered (`"json"`).
  - `src/templates/index.ts` — `PromptTemplate`, `PromptTemplateRegistry`, singleton
    `promptTemplateRegistry`; one template registered (`"generate-from-context"`).
  - `src/credentials/index.ts` — `getCredential(key)`, the single sanctioned place to
    read model API keys from `process.env`.
- `packages/api/src/providers/stubProvider.ts` — `ModelProvider` with id `"stub"`,
  reproducing the original stub `callModel()`'s echo-back shape.
- `packages/api/src/providers/anthropicProvider.ts` — `ModelProvider` with id
  `"anthropic"`, calling `claude-opus-4-8` via `@anthropic-ai/sdk`'s streaming API,
  yielding a `Chunk` per text delta plus a final `{ text: "", done: true }`.
- `packages/api/src/providers/init.ts` — `initProviders()` (registers both providers)
  and `activeProviderId()` (env-var provider selection, see below).
- `packages/api/src/services/generationService.ts` — `callModel()` now builds a prompt
  via `promptTemplateRegistry.get("generate-from-context").render(context)` and calls
  `modelProviderRegistry.get(activeProviderId()).generate(prompt)`, consuming the
  returned async iterable fully and concatenating `chunk.text`. Also exports
  `streamModel(context)`, the un-consumed async iterable, for the new streaming route.
- `packages/api/src/routes/generate.ts` — new `GET /api/generate/stream/:pageCardId`
  SSE endpoint (read-only, like the existing `/context/:pageCardId` preview — it does
  not persist a new Card or PageCard). `POST /api/generate` is unchanged.
- `packages/api/src/index.ts` — calls `initProviders()` alongside Step 1's
  `initCardTypes()` / `initOperations()`, before `createApp()`.
- Root `package.json` build script now builds `@wattle/prompt-engine` between `shared`
  and `api`, since `api` depends on it.

## Provider selection (`MODEL_PROVIDER`)

`activeProviderId()` in `packages/api/src/providers/init.ts`:

1. If `MODEL_PROVIDER` is set, use it verbatim.
2. Otherwise, `"anthropic"` if `ANTHROPIC_API_KEY` is set, else `"stub"`.

So a fresh checkout with no key configured runs the stub provider automatically (as
verified below); setting `ANTHROPIC_API_KEY` switches to the real provider without any
other configuration, and `MODEL_PROVIDER` overrides either default explicitly.

## Deviations from the original instructions

- **The `"generate-from-context"` template's content is new, not moved verbatim.** The
  instructions asked to move "whatever prompt-construction logic currently exists
  (inline or implicit) in generationService.ts" into the template. The pre-Step-2 stub
  `callModel()` never built an actual model prompt — it only formatted a titles-only
  summary (`context.map(c => \`- ${c.title}\`)`) for its own canned response text. That
  isn't sufficient input for a real provider, which needs each Card's *content*, not
  just its title. The template keeps the same `"- title"` list style but includes
  content — the minimum a real generation needs. This is flagged in the template's own
  code comment and in the prompt-engine README.
- **The stub provider can't reproduce the original response byte-for-byte.** The
  original stub took the raw `GenerationContextEntry[]` and could report an exact card
  count and title-only list. `ModelProvider.generate(prompt, opts?)` — the interface
  specified in the instructions — only receives the rendered prompt *string*, not the
  structured context. `stubProvider` recovers an equivalent entry count by splitting the
  prompt on the same `"\n\n"` separator the template uses to join entries, and echoes
  the full rendered prompt (title + content) rather than a titles-only list. The
  response envelope ("_Stub response…_", "Context received (N cards):") is unchanged;
  only the body under it now shows content in addition to titles, and only because the
  underlying prompt itself now carries content. `packages/api/src/providers/stubProvider.ts`
  documents this coupling inline.
- **The streaming endpoint does not persist anything.** The instructions describe
  forwarding `callModel()`'s chunks as SSE but don't say whether the new endpoint should
  also create a PageCard the way `POST /api/generate` does. Since the endpoint is a
  `GET` and named as a preview alongside the existing read-only
  `GET /api/generate/context/:pageCardId`, it was implemented the same way: assemble
  context, stream the model's output, don't touch the database. This matches "additive,
  not a replacement" from the instructions — persisting a generated Card is still
  exclusively what `POST /api/generate` (the `card.generate` Operation) does.
- **`generationService.ts` now imports from `../providers/init.js`** (for
  `activeProviderId()`), which is a service-layer file reaching into a
  provider-selection file one directory over rather than a strict services →
  repositories layering. This was the most direct way to satisfy "Replace the internal
  stub logic in callModel() with a call to modelProviderRegistry.get(activeProviderId())"
  as literally instructed, without introducing a new indirection layer for a two-package
  step.
- **Anthropic SDK version was resolved live** (`npm view @anthropic-ai/sdk version` →
  `0.110.0`) rather than guessed, since an incorrect pinned version could fail to
  install or expose a different streaming API shape.
- **Could not manually verify the real `MODEL_PROVIDER=anthropic` path** — this sandboxed
  dev environment has no `ANTHROPIC_API_KEY` configured, so only the stub-provider path
  (both non-streaming and streaming) was exercised end-to-end. The Anthropic SDK
  integration follows the documented streaming pattern (`client.messages.stream(...)`,
  `content_block_delta` events with `text_delta`) and the package builds and typechecks
  cleanly, but a live call to `claude-opus-4-8` was not made. Recommend a manual smoke
  test with a real key before relying on this path in production.

## Verified

- `npm install` from repo root — picks up the new `@wattle/prompt-engine` workspace
  package and `@anthropic-ai/sdk` dependency, clean.
- `npm run build` (shared → prompt-engine → api → web) — clean, no type errors.
- `npm run dev` with no `ANTHROPIC_API_KEY` set — API on `:4000` and web on `:5173` both
  start with no errors; `activeProviderId()` correctly falls back to `"stub"`.
- Manual end-to-end `curl` run:
  - `POST /api/generate` (existing, non-streaming) still returns the same
    `GenerateResponse` shape (`context`, `card`, `pageCard`) and still persists a new
    Card + PageCard exactly as before.
  - `GET /api/generate/stream/:pageCardId` returns a valid SSE stream
    (`data: {"text":...,"done":...}\n\n`) and does not create any new Card or PageCard.
  - Built a real two-Page stack (Background card in the page above, Question card in
    the page below) and confirmed both `GET /api/generate/context/:pageCardId` and the
    new streaming endpoint correctly include the Background card's title *and content*
    in the assembled context / rendered prompt — confirming the new
    `"generate-from-context"` template actually carries content through, not just
    titles.

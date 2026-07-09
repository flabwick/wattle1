# @wattle/prompt-engine

Three small registries for turning a Card's context into a model call, mirroring the
pattern in [`packages/shared/src/registries/README.md`](../shared/src/registries/README.md)
(CardTypeRegistry / OperationRegistry from Step 1): register a definition once, look it
up by id everywhere else, no editing existing files to add a new one.

## Parsers (`src/parsers/index.ts`)

Parses a raw model-response string into structured data, and serializes it back.

```ts
export interface Parser {
  id: string;                 // unique key, e.g. "json"
  parse(raw: string): unknown;
  serialize(data: unknown): string;
}
```

`parserRegistry` is the singleton instance (`register`, `get`, `list`). One parser is
registered out of the box: `"json"` (`JSON.parse` / `JSON.stringify`).

### Adding a new Parser

1. Add `parserRegistry.register({ id, parse, serialize })` — either inline in
   `src/parsers/index.ts` next to the `"json"` registration, or in its own file that
   `src/parsers/index.ts` imports for its side effect.
2. Look it up elsewhere with `parserRegistry.get("<id>")`.

## Prompt Templates (`src/templates/index.ts`)

Renders a context value into the literal prompt string sent to a `ModelProvider`.

```ts
export interface PromptTemplate {
  id: string;                    // unique key, e.g. "generate-from-context"
  render(context: unknown): string;
}
```

`promptTemplateRegistry` is the singleton instance (`register`, `get`, `list`). One
template is registered out of the box: `"generate-from-context"`, which takes a
`GenerationContextEntry[]` (from `@wattle/shared`) and renders each entry as
`- title\ncontent`, blank-line separated.

> **Note on this template's origin:** `generationService.ts`'s pre-Step-2 stub
> `callModel()` never actually built a model prompt — it only formatted a titles-only
> summary for its own canned response text. That isn't sufficient input for a real
> provider, which needs each Card's content, not just its title. `"generate-from-context"`
> keeps the same `"- title"` list style for readability but includes content, since that's
> the minimum a real generation needs. See `docs/step2-model-providers.md` for the full
> reasoning.

### Adding a new PromptTemplate

1. Register it — `promptTemplateRegistry.register({ id, render })` — in
   `src/templates/index.ts` or a file it imports for its side effect.
2. Reference it by id wherever a prompt needs to be built:
   `promptTemplateRegistry.get("<id>").render(context)`.

## Credentials (`src/credentials/index.ts`)

```ts
export function getCredential(key: string): string;
```

The single place any `ModelProvider` should read API keys from — throws a clear error
if the named environment variable is missing. No other file should call `process.env`
directly for model credentials.

## ModelProviders (defined in `@wattle/shared`, implemented in `@wattle/api`)

Not part of this package — `ModelProviderRegistry` lives in
`packages/shared/src/registries/modelProvider.ts` (alongside `CardTypeRegistry` /
`OperationRegistry`) because both `@wattle/api` and any future consumer need the
interface without depending on `@wattle/api`'s concrete provider implementations.

```ts
export interface Chunk { text: string; done: boolean }
export interface ModelProvider {
  id: string;                                                   // e.g. "anthropic", "stub"
  generate(prompt: string, opts?: Record<string, unknown>): AsyncIterable<Chunk>;
}
```

### Adding a new ModelProvider

1. Create `packages/api/src/providers/<name>Provider.ts` exporting a `ModelProvider`
   object. Read any credentials via `getCredential()` from this package — never
   `process.env` directly.
2. Register it in `packages/api/src/providers/init.ts`, inside `initProviders()`.
3. Select it by setting `MODEL_PROVIDER=<id>` (see `activeProviderId()` in the same
   file), or by extending that function's selection logic.

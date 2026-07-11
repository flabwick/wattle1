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

## Card Block Parser (`src/parsers/cardBlockParser.ts`)

A stateful, incremental parser — not part of `ParserRegistry` above, which is for
one-shot whole-string parsing — for the output contract every prompt in `prompts/`
commits the model to: exactly one root `<card type="..." title="...">...</card>` block,
which may contain any number of nested `<card>` blocks at any depth.

```ts
const parser = new CardBlockParser();
for await (const chunk of modelStream) {
  const events = parser.push(chunk.text);   // CardBlockEvent[]: open / text / error
  // forward each event, e.g. as an SSE message
}
const finalEvents = parser.finish();        // done, or error if unterminated
```

Stack-based: `open` events push a frame (with a unique `id` and its `parentId`, or
`null` for the root), `close` pops one, and `text` always reports which `id` it belongs
to — so a consumer never has to re-parse anything to know which card block (root or
nested) is currently open. Tags split across chunk boundaries are buffered internally
and resolved once the rest arrives.

## Prompt Compiler (`src/promptCompiler.ts` + `prompts/`)

Compiles a trigger into the `{systemPrompt, userMessage}` pair sent to a
`ModelProvider`. Replaces the old flat "generate-from-context" template.

```ts
export type PromptMode = "generate" | "selection" | "interactive";

export function compilePrompt(input: CompilePromptInput): CompiledPrompt;
// CompiledPrompt = { systemPrompt: string; userMessage: string }
```

The system prompt for each mode is loaded **fresh from disk** on every call from
`prompts/<mode>/system.md` (see [`prompts/README.md`](./prompts/README.md)) — editing one
of those files changes model behavior on the next generation, no rebuild or restart
required. The user message is the assembled context in the existing "everything above,
nothing below" directional form (unchanged — see `generationService.assembleContext`),
plus, for `selection`/`interactive`, the extra input that mode needs.

All three modes share the same output contract, written into each `system.md`: the
model's entire response is exactly one root `<card type="..." title="...">...</card>`
block, which may itself contain any number of nested `<card>` blocks at any depth for
sub-points. `src/parsers/cardBlockParser.ts` is the streaming parser that consumes that
format.

### Adding a new prompt mode

1. Create `prompts/<mode>/system.md`.
2. Add `<mode>` to `PromptMode`, `SYSTEM_PROMPT_FILE`, and a matching input type in
   `src/promptCompiler.ts`.

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

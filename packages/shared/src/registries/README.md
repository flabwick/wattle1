# Registries

Two small registries live here so new Card types and new Operations can be added by
*registering* them, without editing the files that already handle existing ones. Two
more, sibling registries, live outside this package for the reasons noted in their
own sections below: `CardTypeUiRegistry` (`@wattle/web`) and `ActionJobRegistry`
(`@wattle/web`).

**Before you add a new CardType or Operation, read
[`docs/adding-features.md`](../../../../docs/adding-features.md) at the repo
root.** It's the full checklist — this file only covers the registry API shape
itself. The short version: several of this app's system prompts (
`packages/prompt-engine/prompts/`) describe the app's capabilities to an LLM in
plain English, and nothing here enforces that they stay accurate — a new CardType
or Operation that changes what's possible in the app is easy to add correctly here
and still leave a prompt quietly out of date. The root guide has the specific list
of what to check.

## CardTypeRegistry (`cardType.ts`)

Describes a kind of Card: its data shape (validated with a zod schema), a factory for
default data, and which Operations it allows.

```ts
export interface CardTypeDefinition<TData = unknown> {
  id: string;                       // unique key, e.g. "note"
  displayName: string;
  dataSchema: ZodSchema<TData>;
  defaultData: () => TData;
  supportsOperations: string[];     // Operation ids, or ["*"] for all
}
```

`cardTypeRegistry` is the singleton instance (`register`, `get`, `list`).

### Adding a new CardType

1. Create `src/registries/definitions/<name>CardType.ts` exporting a
   `CardTypeDefinition` (see `definitions/noteCardType.ts` for the existing example).
2. Register it in `src/registries/init.ts`, inside `initCardTypes()`, and export it
   from `src/index.ts`.
3. Both `@wattle/api` and `@wattle/web` call `initCardTypes()` once at startup
   (`@wattle/web` via `src/registries/init.ts`'s own `initRegistries()`, see below).
4. A CardType with no matching UI is invisible and uneditable in the app — see
   `CardTypeUiRegistry` below, which is the other half of making a new type actually
   usable.
5. **Check whether this new type changes what an LLM should know about the app** —
   see `docs/adding-features.md` at the repo root for the specific prompts to check.

## OperationRegistry (`operation.ts`)

Describes a single named mutation/action (e.g. `"card.rename"`), independent of any
particular HTTP route: a zod schema for its payload, and an `execute` function.

```ts
export interface Operation<TPayload = unknown, TResult = unknown> {
  id: string;                                   // e.g. "card.rename"
  payloadSchema: ZodSchema<TPayload>;
  execute: (ctx: OperationContext, payload: TPayload) => Promise<TResult>;
}
```

`OperationContext` is intentionally minimal — currently just `{ prisma: unknown }` (typed
loosely here because the concrete `PrismaClient` type is generated inside `@wattle/api`,
which this package must not depend on).

`operationRegistry` is the singleton instance (`register`, `get`, `list`).

### Adding a new Operation

1. Create `packages/api/src/operations/<name>.ts` exporting an `Operation` object. Put
   the actual logic in a service function under `src/services/` and have `execute` call
   it — keep `execute` a thin adapter, not a place to inline business logic.
2. Register it in `packages/api/src/operations/init.ts`, inside `initOperations()`.
3. In the route handler that should trigger it, look up the operation with
   `operationRegistry.get(id)`, build a raw payload object from `req.params`/`req.body`,
   and run it through `runOperation(id, payload)` (`packages/api/src/operations/run.ts`),
   which validates against `payloadSchema` and calls `execute`. A failed validation
   throws a `ZodError`, which the app's error handler (`src/app.ts`) turns into a `400`.

Not every mutation in the app is an Operation — several (creating a Card, removing a
Card from a Page vs. deleting it entirely, reordering Pages) are plain service calls
instead, because they didn't map cleanly onto a single `card.*`-style id. Look at
`packages/api/src/operations/*.ts` for the current registered set and which route
each wraps before deciding whether a new mutation needs its own Operation id or is
simpler as a plain route+service pair.

## CardTypeUiRegistry (`@wattle/web`'s `src/registries/cardTypeUi.ts`)

The UI counterpart to `CardTypeRegistry` above: what to actually *render* for a
CardType (`{ View, Editor, PickerTile }`), as opposed to what data it holds. A
separate registry, in `@wattle/web` rather than here, because this package
(`@wattle/shared`) can't depend on React.

### Adding UI for a new CardType

1. Create `packages/web/src/components/Card/types/<name>/` with
   `<Name>View.tsx`, `<Name>Editor.tsx`, `<Name>PickerTile.tsx` — see
   `types/link/` for the smallest existing example.
2. Register the triplet in `packages/web/src/registries/cardTypeUiInit.ts`, inside
   `initCardTypeUi()`.
3. Wire creation into the Feed Input Button: add an `onAdd<Name>` prop to
   `FeedInputButton.tsx`, thread it through `PageStack.tsx`'s `feedInput` prop, and
   add a `handleAdd<Name>ToCurrentPage` handler in `App.tsx` — see any existing
   `onAddSearch`/`onAddPageLinks` wiring for the exact pattern.

## ActionJobRegistry (`@wattle/web`'s `src/lib/actionJobRegistry.ts`)

A third, independent registry: the vocabulary of runnable steps an "action" Card's
own button (or an inline `actionButton` rich-text node) can be configured to run —
`createCard`, `renameCard`, `openUrl`, and so on. Each entry declares its own form
fields (`ActionFieldSpec[]`) and an async `run()`. Client-side only, like
`CardTypeUiRegistry` above, since a job's own logic calls browser-side things
(the fetch-based API client, `window.open`, the reactive `cardStore` cache).

### Adding a new action job

1. Register it with `actionJobRegistry.register({...})` in `actionJobRegistry.ts`
   itself (every existing job lives there) — unless, like `generateSteps`
   (`lib/actionScriptJob.ts`), it would create a circular import; in that case give
   it its own module and side-effect-import that module from `lib/actionJobs.ts`
   (see `actionScriptJob.ts`'s own doc comment for why).
2. **This job's id, label, and fields are picked up automatically** by the
   LLM-facing "action-script" system prompt (`buildActionScriptActionsDoc` in
   `lib/actionScriptPrompt.ts`, spliced into
   `packages/prompt-engine/prompts/action-script/system.md`) — you do not need to
   edit that prompt by hand for an ordinary new job. You only need to touch it if
   the job needs an explanation beyond its own id/label/fields, or if it introduces
   a genuinely new field *kind* (which also needs a new case in
   `actionScriptPrompt.ts`'s `describeField`).

# Registries

Two small registries live here so new Card types and new Operations can be added by
*registering* them, without editing the files that already handle existing ones.

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
2. Register it in `src/registries/init.ts`, inside `initCardTypes()`.
3. Both `@wattle/api` and `@wattle/web` should call `initCardTypes()` once at startup
   (currently only `@wattle/api` does — `@wattle/web` has no code that reads the
   registry yet).

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

## Existing registrations (as of Step 1)

- CardType: `"note"` (title + markdown content — the only card type so far).
- Operations: `card.rename`, `card.delete`, `card.reorder`, `card.edit`, `card.save`,
  `card.generate`. See the per-operation files in `packages/api/src/operations/` for
  which route each wraps and why. A few existing mutations were deliberately left as
  plain service calls because they don't map 1:1 onto this operation-id list: creating a
  Card (`POST /api/cards`, `POST /api/pages/:pageId/cards`), removing a Card from a Page
  vs. deleting it entirely (`DELETE /api/page-cards/:id` and `/:id/vault`), and
  reordering Pages themselves (`PUT /api/pages/reorder`, distinct from reordering the
  Cards within one Page). Folding those into the six listed ids would have meant either
  inventing new ids beyond what was specified or conflating semantically different
  mutations under one id — both riskier than leaving them alone for this step.

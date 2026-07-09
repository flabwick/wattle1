# Step 1 — Foundation Registries (CardType + Operation)

Introduces two registries — `CardTypeRegistry` and `OperationRegistry` — so future card
types and operations can be added by registering them, without editing files that
already handle existing ones. This step is a pure refactor: no user-visible behavior
changed, no new card types or operations were added beyond what already existed.

See [`packages/shared/src/registries/README.md`](../packages/shared/src/registries/README.md)
for how to add a new CardType or Operation going forward.

## What was added

- `packages/shared/src/registries/cardType.ts` — `CardTypeDefinition`, `CardTypeRegistry`,
  singleton `cardTypeRegistry`.
- `packages/shared/src/registries/operation.ts` — `Operation`, `OperationContext`,
  `OperationRegistry`, singleton `operationRegistry`. `OperationContext` is just
  `{ prisma: unknown }` — loosely typed because the concrete `PrismaClient` type lives in
  `@wattle/api`'s generated client, which `@wattle/shared` must not depend on.
- `packages/shared/src/registries/definitions/noteCardType.ts` — registers the one
  existing card type, `"note"` (`{ title: string; content: string }`).
- `packages/shared/src/registries/init.ts` — exports `initCardTypes()`.
- `packages/api/src/operations/{cardRename,cardDelete,cardReorder,cardEdit,cardSave,cardGenerate}.ts`
  — one `Operation` per id, each a thin wrapper whose `execute` calls the existing
  service function (`cardService`, `pageCardService`, `generationService`) unchanged.
- `packages/api/src/operations/init.ts` — exports `initOperations()`.
- `packages/api/src/operations/run.ts` — `runOperation(id, rawPayload)` helper used by
  route handlers: looks up the operation, validates the payload with
  `payloadSchema.parse`, calls `execute`.
- `packages/api/src/index.ts` — calls `initCardTypes()` and `initOperations()` before
  `createApp()`.
- `packages/api/src/app.ts` — the global error handler now maps a thrown `ZodError` to
  `400 { error }` (previously only a handful of routes had hand-written 400 checks;
  routes that go through `runOperation` now get that for free).

## Operation ↔ route mapping

| Operation id     | Route                                    | Service function (unchanged)         |
|-------------------|-------------------------------------------|----------------------------------------|
| `card.rename`     | `PATCH /api/cards/:id`                    | `cardService.updateCard`               |
| `card.delete`     | `DELETE /api/cards/:id`                   | `cardService.deleteCard`               |
| `card.edit`       | `PATCH /api/page-cards/:id`               | `pageCardService.updateDraft`          |
| `card.save`       | `POST /api/page-cards/:id/save`           | `pageCardService.saveToVault`          |
| `card.reorder`    | `PUT /api/pages/:pageId/cards/reorder`    | `pageCardService.reorderPageCards`     |
| `card.generate`   | `POST /api/generate`                      | `generationService.generateFromCard`   |

## Deviations from the original instructions

- **Six operation ids couldn't cover every existing mutation 1:1.** The instructions
  named exactly `card.rename`, `card.delete`, `card.reorder`, `card.edit`, `card.save`,
  `card.generate`, but the actual code has more distinct mutations than that. Left
  as plain (unwrapped) service calls, as before:
  - `POST /api/cards` and `POST /api/pages/:pageId/cards` — creating a Card. "Create"
    wasn't in the requested id list.
  - `DELETE /api/page-cards/:id` (remove from Page only) and
    `DELETE /api/page-cards/:id/vault` (remove + delete from vault) — two more delete
    variants beyond the vault-level `DELETE /api/cards/:id`. Folding all three into one
    `card.delete` id would have conflated semantically different operations.
  - `PUT /api/pages/reorder` — reorders **Pages**, not Cards; `card.reorder` was used
    for `PUT /api/pages/:pageId/cards/reorder` (reordering Cards within a Page) instead.
  - `GET /api/generate/context/:pageCardId` — read-only context preview, not a mutation.
- **`card.rename` vs `card.edit`**: there isn't a dedicated "rename" endpoint distinct
  from a general edit. `card.rename` was assigned to the vault-level edit
  (`PATCH /api/cards/:id`, changes the Card directly) and `card.edit` to the in-page
  draft edit (`PATCH /api/page-cards/:id`, doesn't touch the vault Card until
  `card.save`) — this maps onto the existing "draft vs. vault" distinction already in
  the code.
- **Execute bodies call the existing service functions rather than inlining their code.**
  The instructions said to "move the existing function body into `execute`"; instead
  `execute` calls e.g. `cardService.updateCard(...)` unchanged. Net effect is identical
  (zero logic rewritten) with less churn and no duplicated logic between the service
  layer and the operations layer.
- **Registry init is an explicit function call, not an import-for-side-effects module.**
  `initCardTypes()` / `initOperations()` are plain exported functions called from
  `packages/api/src/index.ts`, rather than modules that register as a side effect of
  being imported. `@wattle/shared` has no `exports` map in its `package.json`, so a deep
  subpath import (e.g. `@wattle/shared/src/registries/init.js`) would have worked but is
  more fragile than importing a named export from the package's main barrel — especially
  once `packages/web` (bundled with Vite, not `tsx`) needs the same init in a later step.
- **`packages/web` was not updated to call `initCardTypes()`.** The instructions'
  registry-design section (step 2) asked for both `@wattle/api` and `@wattle/web` to call
  init at startup, but the instructions' step 4 explicitly said not to touch
  `packages/web` at all this step. Step 4 was treated as authoritative. This has no
  practical effect yet since nothing in the frontend reads `cardTypeRegistry` — it's
  wiring for a future step.
- **Fixed a pre-existing, unrelated build break in `generationService.ts`.** `tsc`
  failed on `generateFromCard`'s `prisma.pageCard.create({ data: { pageId, ...,
  card: { create: {...} } } })` — mixing the scalar `pageId` (Prisma's "unchecked" input
  variant) with a nested `card: { create }` relation write (the "checked" variant) is
  rejected by Prisma's generated types. The identical pattern in
  `pageCardService.addNewCardToPage` was already fixed in the immediately preceding
  commit (`b3a051b`) by switching to `page: { connect: { id: pageId } }`; the same fix
  was applied here so the package actually builds. This file was otherwise untouched —
  confirmed via `git diff` before making the fix — so the bug predates this step and
  wasn't introduced by the registry refactor.
- Added `zod` as a direct dependency of both `@wattle/shared` (for `dataSchema` /
  `payloadSchema` types) and `@wattle/api` (operation files `import { z } from "zod"`
  directly).

## Verified

- `npm install` from repo root — clean.
- `npm run build` (shared → api → web) — clean, no type errors.
- `npm run dev` — API on `:4000` and web on `:5173` both start with no errors.
- Manual end-to-end run through `curl` covering: create Page → add new Card to Page →
  `card.edit` (draft) → `card.save` → `card.rename` (vault) → `card.generate` →
  `card.reorder` → an intentionally invalid `card.rename` payload (confirmed `400` with
  a validation message, where the old code would have silently passed a bad value to
  Prisma) → `card.delete` → delete Page. All responses matched the pre-existing shapes.

# Step 3 — Flexible Card Schema + Frontend Streaming + Design System/i18n

The last foundation step. Three mostly-independent pieces: (A) a versioned JSON
metadata column on `Card` so new per-Card fields don't need new DB columns, (B) wiring
`packages/web` to the Step 1/2 registries and the Step 2 streaming endpoint (nothing in
`packages/web` had been touched before this step), and (C) design-token primitives and
an i18n key layer for the frontend.

## PART A — Flexible Card metadata

- `packages/api/prisma/schema.prisma` — added `metadata` to `Card`, plus a new,
  applied migration (`20260708131111_add_card_metadata`). **Additive only**: the
  migration rebuilds the SQLite table (SQLite's `ALTER TABLE ADD COLUMN` mechanism)
  but preserves every existing row via `INSERT ... SELECT`, and no existing column was
  touched.
- `packages/shared/src/registries/cardMetadata.ts` — `cardMetadataV1Schema` (zod),
  `CardMetadataV1` (inferred type), `CURRENT_METADATA_VERSION = 1`,
  `defaultMetadata()`, and `migrateMetadata(raw)` — parses raw JSON, treats a missing
  or `1` `version` as v1 with defaults filled in, throws on anything else. Structured
  so a `version === 2` branch can be added later without touching call sites.
- `packages/shared/src/types.ts` — `Card.metadata: CardMetadataV1` (required in every
  API response); `CreateCardInput.metadata?: unknown` / `UpdateCardInput.metadata?:
  unknown` (optional, raw — validated server-side before persisting).
- `packages/api/src/services/cardService.ts` — new exported `serializeCard()`, the one
  place that turns a Card row into a `Card`: parses the metadata column and runs it
  through `migrateMetadata()`. `createCard()` defaults metadata via `defaultMetadata()`
  when the caller doesn't provide it, validates via `cardMetadataV1Schema.parse()` when
  it does. `updateCard()` only touches metadata when explicitly provided (matching the
  existing partial-update semantics for `title`/`content`) — omitting it leaves the
  Card's existing metadata untouched.
- `pageCardService.ts` (`addNewCardToPage`'s nested Card create), `pageService.ts`
  (`serializePageCard`'s nested card), and `generationService.ts`
  (`generateFromCard`'s nested Card create) all now go through `serializeCard()` /
  `defaultMetadata()` too, instead of each hand-building its own Card-shaped object —
  see "Deviations" below for why this was consolidated into one function rather than
  patched four times.
- No HTTP route changes: `POST /api/cards`, `PATCH /api/cards/:id`, etc. all still take
  exactly the body they took before. Metadata always round-trips (create without it →
  default persisted; read → migrated shape returned) without any endpoint needing to
  expose metadata editing yet, per the instructions.

## PART B — Frontend: registry-driven rendering + streaming

- `packages/web/src/registries/init.ts` — `initRegistries()`, called once from
  `main.tsx` before the app renders. Calls `initCardTypes()` (from `@wattle/shared`)
  and registers the six Operation ids in the browser's own `operationRegistry`
  instance — see "Deviations" for why these are id-only stand-ins, not the real
  server-side `Operation` objects.
- `packages/web/src/components/Dock/Dock.tsx` — the action-button list is now computed
  from `cardTypeRegistry.get("note").supportsOperations` resolved against
  `operationRegistry.list()` (`supportedOperationIds()`), instead of a fixed JSX button
  list. Verified in a real browser (Playwright) that the note type's `["*"]` wildcard
  still produces the exact same five buttons — Edit, Save, Generate, Remove, Delete —
  in the same order, with the same disabled/danger styling, as before this step.
- `packages/web/src/hooks/useGeneration.ts` — `useGeneration()` opens an `EventSource`
  against `GET /api/generate/stream/:pageCardId` and exposes `{ text, isStreaming,
  error, start }`. `App.tsx`'s `handleGenerate` now calls `generation.start(...)`
  first (best-effort — a live preview) and passes `generation.text` down to `Dock` as
  a new `streamingText` prop, rendered in a `.dock__stream-preview` element while
  `generating` is true. The actual persisting call — `generate()` from `usePages`
  (`POST /api/generate`, unchanged) — still runs afterwards; see "Deviations" for why
  both calls happen.

## PART C — Design primitives + i18n

- `packages/web/src/components/primitives/` — `Button`, `CardShell`, `Badge`,
  `InputField`, each with its own `.css` file styled purely from `tokens.css`
  variables, plus a barrel `index.ts` and a `README.md`. `Card.tsx` now composes
  `CardShell` + `Badge`; `Dock.tsx` now composes `Button` + `InputField`. Both
  components' own `.css` files were slimmed to drop the box-model rules the
  primitives now own (e.g. `Dock.css` no longer duplicates button border/padding —
  see the comments left in place explaining what moved where).
- `packages/web/src/i18n/` — `en.json` (every user-facing string that was previously
  hardcoded, across `App.tsx`, `Dock.tsx`, `Card.tsx`, `PageStack.tsx`,
  `VaultView.tsx`), `index.ts` (`t(key)` / `useTranslation()` — flat lookup, falls
  back to the raw key on a miss), and a `README.md`. Every hardcoded string in those
  five components was replaced with a `t("...")` call; verified via `grep` that no
  quoted UI copy remains outside of code comments, and via build + a running browser
  that displayed text is identical to before.

## Deviations from the original instructions

- **SQLite doesn't support Prisma's `Json` scalar type.** `npx prisma migrate dev`
  failed validation with `Field "metadata" ... can't be of type Json. The current
  connector does not support the Json type.` — this predates Step 3; it's a property
  of the `sqlite` connector already chosen for this project (see `docs/skeleton.md`).
  Switched to `metadata String @default("{}")`, with `JSON.stringify`/`JSON.parse`
  done explicitly in `cardService.ts` — the standard SQLite workaround, and
  functionally identical from every caller's perspective (the `Card.metadata` field in
  API responses is still a real, typed JS object; only the DB column type differs from
  the literal instruction).
- **`serializeCard()` was extracted and reused, rather than adding metadata separately
  in four places.** Before this step, `cardService.ts`, `pageCardService.ts`,
  `pageService.ts`, and `generationService.ts` each independently hand-built a
  Card-shaped object from a Prisma row. Patching all four in parallel with the same
  `migrateMetadata`/`defaultMetadata` logic would have meant four copies of the same
  mapping to keep in sync (and a fifth version-2 metadata migration would need the
  same four edits again). Consolidating into one exported `serializeCard()` in
  `cardService.ts`, imported by the other three, means a future metadata-shape change
  is a one-file edit. This is a refactor beyond the letter of "update card read/write
  logic... so metadata always round-trips," but stays inside its spirit and its stated
  scope (only touches the same call sites the instructions already named).
- **Client-side `Operation` registrations are id-only stand-ins, not the real
  server-side Operations.** The instructions ask the Dock to derive its buttons from
  `operationRegistry.list()`. The real `Operation` objects (`packages/api/src/operations/*.ts`)
  have an `execute` that imports Prisma-backed services — Node-only code that can't run
  in a browser bundle (and shouldn't: the browser has no direct DB access by design).
  `packages/web/src/registries/init.ts` registers the same six ids with a `payloadSchema:
  z.unknown()` and an `execute` that throws if ever called (it never is — the Dock only
  reads `.id` off the list; actual mutations still go through `api/client.ts`'s fetch
  calls to the HTTP endpoints, unchanged). This does mean the six operation ids are
  declared twice (once server-side with real `execute`, once client-side as a stand-in)
  — an unavoidable duplication given `execute` fundamentally cannot be shared between a
  Node process with DB access and a browser bundle without one.
- **"Remove from page" has no Operation id to gate on, so it's always shown.** Step 1
  deliberately left `DELETE /api/page-cards/:id` (remove from page, vault Card
  untouched) and `DELETE /api/page-cards/:id/vault` (remove + delete vault Card)
  unwrapped — outside the six-id `OperationRegistry` — because they didn't map 1:1 onto
  the requested ids (see `docs/step1-registries.md`). The Dock's "Remove" button
  corresponds to the first of those, so it's tagged `operationId: null` in
  `Dock.tsx`'s action list and rendered unconditionally, alongside the four buttons
  (Edit/Save/Generate/Delete) that *are* gated by `card.edit`/`card.save`/
  `card.generate`/`card.delete` respectively. "Delete" maps to `card.delete`
  (`DELETE /api/cards/:id`) even though the button's actual handler calls
  `DELETE /api/page-cards/:id/vault` — the closest semantic match among the six ids,
  since the PageCard-scoped "delete entirely" endpoint was also left unwrapped in
  Step 1 for the same reason "Remove" was.
- **Card has no `typeId` field.** The instructions' pseudocode
  (`cardTypeRegistry.get(card.typeId ?? "note")`) assumes a `typeId` field that
  doesn't exist on `Card` — PART A only added `metadata`, not a type discriminator, and
  Step 3 didn't ask for one. `Dock.tsx` calls `supportedOperationIds("note")` directly,
  with a comment marking it as the one-CardType-only stand-in for where a real
  per-Card lookup would go once `typeId` exists.
- **Generating a Card now calls the model twice.** Step 2 deliberately built
  `GET /api/generate/stream/:pageCardId` as read-only — it never persists a Card (see
  `docs/step2-model-providers.md`). Since Step 3 requires both a live incremental
  preview *and* an unchanged persisted result, and there's no endpoint that accepts a
  client-held generated string to persist directly, `handleGenerate` in `App.tsx` calls
  the streaming endpoint first (preview, discarded) and then the existing non-streaming
  `POST /api/generate` (persist, unchanged). With the stub provider this is harmless —
  `callModel`/`streamModel` are pure functions of the assembled context, so both calls
  produce identical text. With a non-deterministic real model, the two calls could
  produce *different* text, meaning what the user watches stream in could differ
  slightly from what's actually saved a moment later. Fixing this would mean either
  making the streaming endpoint itself persist (changing Step 2's design, not
  requested) or adding a new "persist this exact text" endpoint (new API surface, not
  requested) — flagging as a known limitation rather than making that call unasked.
  The streaming call is wrapped in `.catch(() => {})` specifically so a streaming
  failure (network hiccup, endpoint unavailable) never blocks the real, persisting
  generate call — Generate keeps working even if the live preview doesn't.
- **Zod added as a direct dependency of `packages/web`.** Needed for the id-only
  `Operation` stand-ins' `payloadSchema` field (any valid `ZodSchema` satisfies the
  type; `z.unknown()` was used since the schema is never actually parsed against on
  the client). Already present transitively via `@wattle/shared`/`@wattle/api`, but
  added explicitly per the same convention Step 1/2 used for `packages/api`.

## Verified

- `npm install` and the new Prisma migration — both clean.
- `npm run build` across all four packages (`shared` → `prompt-engine` → `api` →
  `web`) — clean, no type errors.
- `npm run dev` — API (`:4000`) and web (`:5173`) both boot with no errors.
- **Metadata round-trip**: `POST /api/cards` with no `metadata` in the body, then
  `GET`/`list` — both return `{"version":1,"links":[],"log":[]}` consistently.
- **Existing operations unchanged**: re-ran the full Step 1/2 `curl` sequence (create
  page → add card → `card.edit` → `card.save` → `card.rename` → `card.generate` →
  `card.reorder` → `card.delete`) — every response now additionally carries `metadata`
  on its `card` object, nothing else differs.
- **Streaming endpoint** still returns a valid SSE response after Step 3's changes.
- **Real browser verification (Playwright + headless Chromium)**, since this step is
  primarily frontend-facing:
  - Dock buttons for a "note" Card, read live from the DOM: exactly
    `["Edit","Save","Generate","Remove","Delete"]`, in that order — confirms the
    registry-derived list matches the pre-Step-3 hardcoded one.
  - Clicked Generate on a real Card: a new "Generated response" Card appeared directly
    below the trigger, matching the pre-existing persisted-result behavior exactly (the
    live SSE preview window was too brief to catch in a screenshot with the stub
    provider, which resolves near-instantly — the underlying SSE mechanism was
    separately confirmed working via `curl`).
  - Entered Dock edit mode: title `InputField` and content `InputField multiline`
    render with the same visual appearance (borders, radius, placeholder text) as the
    pre-refactor hand-rolled `<input>`/`<textarea>`.
  - Vault tab: search box, "New Card title…" input, accent-filled `Create` button
    (the `Button` primitive's `primary` variant), and the Open/Delete list — all
    visually unchanged, all text via `t()`.
  - Zero browser console errors across every screenshot taken.
  - All test data (Pages, Cards) created during this verification pass was deleted
    afterward via the API, leaving the dev database clean.

After this step, the foundation described in the instructions is complete: adding a
new card type, operation, model provider, parser, prompt template, locale, or metadata
field should each be achievable by adding new files/registry entries, without editing
this foundation's core files (with the one caveat above: a genuinely new Operation
still needs a client-side id-only stand-in registered in
`packages/web/src/registries/init.ts`, alongside its real server-side registration in
`packages/api/src/operations/init.ts`, since the two can never share code).

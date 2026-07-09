# Skeleton — What's Been Built

This documents the project skeleton scaffolded from [spec1.md](./spec1.md). The
original CRUD + Generation Rule skeleton (this doc) has since been built on by four
further steps — read those for the detail, this doc gives the overall shape and stays
current on status:

- [step1-registries.md](./step1-registries.md) — `CardTypeRegistry` /
  `OperationRegistry` in `packages/shared`; every existing Card mutation now routes
  through `operationRegistry`.
- [step2-model-providers.md](./step2-model-providers.md) — `ModelProviderRegistry`,
  the new `packages/prompt-engine` package, a real (if unit-untested against a live
  key) Anthropic provider, and a new SSE streaming endpoint.
- [step3-frontend-and-metadata.md](./step3-frontend-and-metadata.md) — a versioned
  JSON metadata column on `Card`; `packages/web` wired to the Step 1/2 registries and
  the streaming endpoint (first frontend changes since the original skeleton); design
  primitives + an i18n layer.
- [step4-design-system.md](./step4-design-system.md) — [styling.md](./styling.md)'s
  "Olive Styling: Refined Neo-Brutalism" spec encoded as `tokens.css` color/border/
  shadow/type values, applied through the Step 3 primitives layer (`VaultView.tsx` and
  `PageStack.tsx` now compose `Button`/`InputField` too, closing the last gap).

As of Step 4, the foundation described by these steps is complete: adding a new card
type, operation, model provider, parser, prompt template, locale, or metadata field
should each be achievable by adding new files/registry entries rather than editing core
files (one caveat: see step3's "Deviations" on client-side Operation stand-ins), and
every visual property in `packages/web/src/components/` is one of `tokens.css`'s
variables rather than a hardcoded value. Dependencies install cleanly, all four
packages build and typecheck, and `npm run dev` boots both servers with no errors —
this has been verified end-to-end, including in a real browser (see "What's genuinely
done vs. stubbed" below).

## Architecture decisions

Following spec1.md Part 4 ("Separate the Brain from the Face"):

- **Monorepo with npm workspaces**, four packages:
  - `packages/shared` — TypeScript types (`Card`, `Page`, `PageCard`, generation
    request/response shapes) imported by every other package, so the data model is
    defined exactly once. Also owns the `CardTypeRegistry`, `OperationRegistry`, and
    `ModelProviderRegistry` (Steps 1–2) — the extension points for adding new card
    types, operations, and model providers without editing existing files.
  - `packages/prompt-engine` — parsing, prompt-template, and credential-handling
    registries (Step 2) that sit between "assembled context" and "call a
    `ModelProvider`". Depends only on `@wattle/shared`.
  - `packages/api` — the backend "brain": Express + Prisma/SQLite. All vault, Page,
    Card, and Generation Rule logic lives here, behind HTTP endpoints, plus the
    concrete `Operation` and `ModelProvider` implementations that get registered at
    startup (`src/operations/init.ts`, `src/providers/init.ts`).
  - `packages/web` — the frontend "face": React + Vite, mobile-first, configured as
    an installable PWA. Talks to the API over `fetch`; contains no business logic of
    its own, per spec1.md's explicit instruction not to let logic leak into the
    frontend. Untouched through Steps 1–2; Step 3 wired it to the registries
    (`src/registries/init.ts`), the SSE endpoint (`hooks/useGeneration.ts`), a small
    design-primitives layer (`components/primitives/`), and an i18n layer (`i18n/`).
- **SQLite via Prisma**, not a hosted DB — single-user local vault, matches "single
  vault, single user" MVP scope, and `prisma/schema.prisma` gives a real migration
  path if that changes later. A migration (`20260708085354_init`) exists and has been
  applied.
- **Every Card and Page has a stable `id` and `createdAt`/`updatedAt`** (spec1.md Part
  4 "State & Data Layer") even though sync/offline isn't built yet — this is meant to
  avoid a schema rewrite when that's added later.
- **PWA first, not native** (spec1.md Part 4) — `vite-plugin-pwa` is configured with a
  manifest so the web app is installable to a phone home screen; no native app yet.

## Data model (`packages/api/prisma/schema.prisma`)

- `Card` — the vault's atomic unit: `id`, `title`, `content` (markdown), `metadata`
  (Step 3: a JSON string holding a versioned `CardMetadataV1` payload — see
  `packages/shared/src/registries/cardMetadata.ts` and step3's doc for why it's a
  `String` column rather than Prisma's `Json` scalar), timestamps.
- `Page` — a stack slot: `id`, `order` (ascending bottom→top), timestamps.
- `PageCard` — join between a Page and a Card, since a Card can be opened into a Page
  and edited there without committing changes to the vault copy until explicitly
  saved. Holds `order` (position within the page) plus nullable `draftTitle` /
  `draftContent` for unsaved inline edits. This is how "Save a Card back to the vault"
  (spec1.md Part 3) is implemented: edits inside a Page write to the `PageCard`
  draft fields; `POST /page-cards/:id/save` copies them onto the underlying `Card`
  and clears the draft.

## The Generation Rule (`packages/api/src/services/generationService.ts`)

Implements spec1.md Part 2/3 literally: `assembleContext(pageCardId)` gathers every
`PageCard` in Pages with a higher `order` than the triggering Page (i.e. stacked
above it), plus every `PageCard` in the same Page with a lower `order` than the
trigger (i.e. above it in that Page's own list) — nothing below either axis. The
context array is exposed directly in the API response (`GenerateResponse.context`)
and via `GET /api/generate/context/:pageCardId`, so context assembly is inspectable
rather than a black box (spec1.md Part 1 §2).

The model call (`callModel()`) now renders the assembled context through
`@wattle/prompt-engine`'s `"generate-from-context"` template and calls whichever
`ModelProvider` is active (`packages/api/src/providers/`) — `"stub"` (echoes the
prompt back, no network call) by default, or `"anthropic"` (real `claude-opus-4-8`
call via `@anthropic-ai/sdk`, streaming) when `ANTHROPIC_API_KEY` is set or
`MODEL_PROVIDER=anthropic` is forced. See
[step2-model-providers.md](./step2-model-providers.md) for the full design and for
what's still unverified (no live-key test has been run against the real provider in
this environment).

## API endpoints (`packages/api/src/routes/`)

| Method & path | Purpose |
|---|---|
| `GET /api/cards?q=` | Vault list + search |
| `POST/PATCH/DELETE /api/cards/:id` | Vault Card CRUD |
| `GET /api/pages` | Full stack, bottom→top, each with its Cards |
| `POST/DELETE /api/pages/:id`, `PUT /api/pages/reorder` | Page CRUD + reorder |
| `POST /api/pages/:pageId/cards` | Open an existing vault Card into a Page, or create a new blank one there |
| `PUT /api/pages/:pageId/cards/reorder` | Reorder Cards within a Page |
| `PATCH /api/page-cards/:id` | Inline edit → draft fields |
| `POST /api/page-cards/:id/save` | Persist draft to vault Card |
| `DELETE /api/page-cards/:id` | Remove from Page only (vault Card untouched) |
| `DELETE /api/page-cards/:id/vault` | Remove from Page and delete the vault Card entirely |
| `POST /api/generate` | Trigger the Generation Rule (unchanged shape since Step 2 — wraps the `card.generate` Operation) |
| `GET /api/generate/context/:pageCardId` | Preview context without generating |
| `GET /api/generate/stream/:pageCardId` | Step 2: SSE preview of a generation's output, read-only like the line above — does not persist a Card |

## Frontend (`packages/web/src/`)

- `registries/init.ts` — Step 3: `initRegistries()`, called once from `main.tsx`.
  Initializes `cardTypeRegistry` and registers id-only `Operation` stand-ins in the
  browser's `operationRegistry` (the real, Prisma-backed `Operation`s only exist
  server-side — see step3's doc for why).
- `components/Vault/VaultView.tsx` — search box, create-new-Card form, list with
  Open/Delete actions; also reachable as an extension panel toggled from the Dock
  footer, not only as a standalone view. Composes the `Button`/`InputField`
  primitives (Step 4 — previously its own hand-rolled `<button>`/`<input>` CSS).
- `components/PageStack/PageStack.tsx` — renders Pages top-to-bottom (highest
  `order` first, matching "top = most kept"), each with its Cards and an "+ Card" /
  "Delete Page" header. Its per-Page action buttons compose `Button` (Step 4); the
  dashed "+ New Page" button stays bespoke (see step4's doc for why).
- `components/Card/Card.tsx` — a single Card's tap target inside a Page; shows an
  "unsaved" badge when draft fields are set. Composes the `CardShell`/`Badge`
  primitives (Step 3) rather than its own box-model CSS.
- `components/Dock/Dock.tsx` — sticky footer, state-dependent per spec1.md Part 2:
  nothing selected → prompt text; a Card selected → title/Edit/Save/Generate/Remove/
  Delete; tapping the title (or Edit) switches to an inline title+textarea editor.
  Since Step 3, that button list is *derived* — `cardTypeRegistry.get("note").supportsOperations`
  resolved against `operationRegistry.list()` — rather than hardcoded JSX, and it
  shows a live incremental preview (`useGeneration`) while a generation streams in,
  styled (Step 4) as a "retro terminal" readout per styling.md. Composes the
  `Button`/`InputField` primitives, plus `VaultView` itself as a toggleable panel.
- `components/primitives/` — Step 3: `Button`, `CardShell`, `Badge`, `InputField`,
  each styled purely from `styles/tokens.css` variables. Step 4 re-themed all four to
  [styling.md](./styling.md)'s "Refined Neo-Brutalism" (bold borders, solid offset
  shadows, warm parchment/terracotta palette) without changing any component's props.
  See its own `README.md` and [step4-design-system.md](./step4-design-system.md).
- `i18n/` — Step 3: `en.json` (every user-facing string) + `t()`/`useTranslation()`
  (flat key lookup, no full i18n library). See its own `README.md`.
- `hooks/usePages.ts`, `hooks/useVault.ts` — data fetching + optimistic-ish mutators
  (mutate local state, call the API, then refetch) per spec1.md Part 4's guidance to
  use optimistic UI rather than blocking on every round-trip. Current implementation
  refetches after each mutation rather than doing full local reconciliation — good
  enough for MVP, worth revisiting if it feels laggy.
- `hooks/useGeneration.ts` — Step 3: opens an `EventSource` against
  `GET /api/generate/stream/:pageCardId` for a live text preview. Read-only on the
  server side, so `App.tsx`'s `handleGenerate` still calls the original, persisting
  `POST /api/generate` afterwards — see step3's doc for the resulting "generates
  twice" tradeoff and why it exists.
- `api/client.ts` — the only module that calls `fetch`; every other frontend module
  deals purely in `@wattle/shared` types. Unchanged by Step 3 (streaming goes through
  `EventSource` in `useGeneration.ts` instead, since it isn't a JSON request/response
  call this client's `request()` helper shape fits).
- `styles/tokens.css` — spacing scale, `--touch-target-min: 44px`, type scale, border
  width/shadow tokens, and light/dark color roles (spec1.md Part 4 "Design System From
  the Start"; Step 4 layers [styling.md](./styling.md)'s neo-brutalist color/border/
  shadow/type values on top), consumed by every component's CSS (now entirely via
  `components/primitives/`, as of Step 4) instead of hardcoded pixel values.
- `App.tsx` — top-level Pages/Vault tab switcher, wires selection state, the Dock's
  callbacks, and the two hooks together. This tab switcher isn't in spec1.md; it's
  the minimal nav needed to reach the Vault view on a single-column mobile layout,
  and is the one structural decision here that isn't a direct translation of the
  spec.

## What's genuinely done vs. stubbed

**Done and real, and now verified (not just written):** the full Prisma schema with
two applied migrations (including Step 3's `metadata` column), all API routes and
services (Card/Page/PageCard CRUD, reordering, draft/save flow) — routed through
`operationRegistry` per Step 1 with identical HTTP behavior — the Generation Rule's
context-assembly logic, a real Anthropic provider wired behind the same `callModel()`
call path with the stub provider as an automatic fallback, and (Step 3) a frontend
that derives its Dock actions from the registries, shows a live streaming preview
during generation, composes a small design-primitives layer, and routes every
user-facing string through an i18n lookup. `npm install`, `npm run build` (all four
packages), and `npm run dev` have all been run and confirmed clean; every route was
exercised end-to-end with `curl`, and Step 3's frontend changes were additionally
verified in a real headless browser (Playwright) — Dock button set, streaming/generate
flow, edit-mode inputs, and the Vault tab all screenshotted and confirmed visually
unchanged with zero console errors (see step3-frontend-and-metadata.md's "Verified").

**Stubbed / unverified:**
- The **live Anthropic call path** (`MODEL_PROVIDER=anthropic` / `ANTHROPIC_API_KEY`
  set) has still not been exercised against a real key in this environment — only the
  stub provider's non-streaming and streaming paths were run end-to-end, including
  through the browser in Step 3. The code follows the documented `@anthropic-ai/sdk`
  streaming shape and typechecks, but a live smoke test is still owed.
- **Generating a Card calls the model twice** (once for the discarded streaming
  preview, once for the real persisted result) — harmless with the deterministic stub
  provider, but could show the user slightly different text than what gets saved with
  a non-deterministic real model. See step3-frontend-and-metadata.md's "Deviations"
  for why, and what a proper fix would require (new API surface, not built here).

**Not done — next steps for whoever picks this up:**
1. Smoke-test the real `MODEL_PROVIDER=anthropic` path with a live `ANTHROPIC_API_KEY`,
   in the browser this time (Step 3 verified the streaming *mechanism* end-to-end, but
   only against the stub provider's near-instantaneous responses).
2. Decide how to reconcile the "generates twice" tradeoff above if it matters for the
   real (non-deterministic) provider — likely needs either the streaming endpoint to
   persist, or a new "persist this exact generated text" endpoint.
3. Add real PWA icons (`packages/web/public/icon-192.png`, `icon-512.png`) —
   referenced in `vite.config.ts`'s manifest but not present as files yet.
4. Add a `typeId` field to `Card` and a real second `CardTypeDefinition` — today
   there's only `"note"`, and `Dock.tsx` hardcodes the `"note"` lookup since there's
   nothing else to look up yet (see step3's doc).
5. A `version === 2` branch in `migrateMetadata()`, whenever a metadata shape change
   is actually needed — the function is already structured for it.
6. Dogfood the two target workflows from spec1.md Part 1 (essay iteration,
   questions-against-a-passage) now that it runs end-to-end, per spec1.md Part 3's
   suggested build order step 5.

# Skeleton — What's Been Built

This documents the project skeleton scaffolded from [spec1.md](./spec1.md). It's a
starting structure for future building, not a finished MVP — most business logic
(context assembly, CRUD) is real and wired up, but the AI call itself is stubbed and
nothing has been run/tested yet (see "Not done" below).

## Architecture decisions

Following spec1.md Part 4 ("Separate the Brain from the Face"):

- **Monorepo with npm workspaces**, three packages:
  - `packages/shared` — TypeScript types (`Card`, `Page`, `PageCard`, generation
    request/response shapes) imported by both other packages, so the data model is
    defined exactly once.
  - `packages/api` — the backend "brain": Express + Prisma/SQLite. All vault, Page,
    Card, and Generation Rule logic lives here, behind HTTP endpoints.
  - `packages/web` — the frontend "face": React + Vite, mobile-first, configured as
    an installable PWA. Talks to the API over `fetch`; contains no business logic of
    its own, per spec1.md's explicit instruction not to let logic leak into the
    frontend.
- **SQLite via Prisma**, not a hosted DB — single-user local vault, matches "single
  vault, single user" MVP scope, and `prisma/schema.prisma` gives a real migration
  path if that changes later.
- **Every Card and Page has a stable `id` and `createdAt`/`updatedAt`** (spec1.md Part
  4 "State & Data Layer") even though sync/offline isn't built yet — this is meant to
  avoid a schema rewrite when that's added later.
- **PWA first, not native** (spec1.md Part 4) — `vite-plugin-pwa` is configured with a
  manifest so the web app is installable to a phone home screen; no native app yet.

## Data model (`packages/api/prisma/schema.prisma`)

- `Card` — the vault's atomic unit: `id`, `title`, `content` (markdown), timestamps.
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

The actual model call (`callModel()`) is a stub that echoes back the titles it
received — it deliberately does not call any AI provider yet. It's factored as a
pure function of the assembled context specifically so wiring up a real provider
(the doc leaves a `TODO` for `ANTHROPIC_API_KEY`) doesn't touch the context-assembly
or routing code around it.

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
| `POST /api/generate` | Trigger the Generation Rule |
| `GET /api/generate/context/:pageCardId` | Preview context without generating |

## Frontend (`packages/web/src/`)

- `components/Vault/VaultView.tsx` — search box, create-new-Card form, list with
  Open/Delete actions.
- `components/PageStack/PageStack.tsx` — renders Pages top-to-bottom (highest
  `order` first, matching "top = most kept"), each with its Cards and an "+ Card" /
  "Delete Page" header.
- `components/Card/Card.tsx` — a single Card's tap target inside a Page; shows an
  "unsaved" badge when draft fields are set.
- `components/Dock/Dock.tsx` — sticky footer, state-dependent per spec1.md Part 2:
  nothing selected → prompt text; a Card selected → title/Edit/Save/Generate/Remove/
  Delete; tapping the title (or Edit) switches to an inline title+textarea editor.
- `hooks/usePages.ts`, `hooks/useVault.ts` — data fetching + optimistic-ish mutators
  (mutate local state, call the API, then refetch) per spec1.md Part 4's guidance to
  use optimistic UI rather than blocking on every round-trip. Current implementation
  refetches after each mutation rather than doing full local reconciliation — good
  enough for MVP, worth revisiting if it feels laggy.
- `api/client.ts` — the only module that calls `fetch`; every other frontend module
  deals purely in `@wattle/shared` types.
- `styles/tokens.css` — spacing scale, `--touch-target-min: 44px`, type scale, and
  light/dark color roles (spec1.md Part 4 "Design System From the Start"), consumed
  by every component's CSS instead of hardcoded pixel values.
- `App.tsx` — top-level Pages/Vault tab switcher, wires selection state, the Dock's
  callbacks, and the two hooks together. This tab switcher isn't in spec1.md; it's
  the minimal nav needed to reach the Vault view on a single-column mobile layout,
  and is the one structural decision here that isn't a direct translation of the
  spec.

## What's genuinely done vs. stubbed

**Done and real:** the full Prisma schema, all API routes and services (Card/Page/
PageCard CRUD, reordering, draft/save flow), the Generation Rule's context-assembly
logic, and a complete frontend wired end-to-end to that API.

**Stubbed:** the actual AI call in `generationService.ts` — it returns placeholder
text instead of calling a model. No provider, API key handling, or streaming is
implemented.

**Not done — next steps for whoever picks this up:**
1. **Dependencies have never been installed and the app has never been run.** The
   session was interrupted before `npm install` completed, so nothing in this
   skeleton has been verified to actually build, typecheck, or boot. Treat every
   file as unverified until `npm install && npm run dev` has been run from the repo
   root and both the API (`:4000`) and web (`:5173`) servers confirmed to start
   cleanly.
2. Run `npm run db:migrate -w @wattle/api` (or from root: `npm run db:migrate`) to
   create the initial SQLite migration — no migration exists yet, only the schema.
3. Wire a real model call into `callModel()` in `generationService.ts`.
4. Add real PWA icons (`packages/web/public/icon-192.png`, `icon-512.png`) —
   referenced in `vite.config.ts`'s manifest but not present as files yet.
5. Dogfood the two target workflows from spec1.md Part 1 (essay iteration,
   questions-against-a-passage) once it runs, per spec1.md Part 3's suggested build
   order step 5.

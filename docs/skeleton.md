# Skeleton — What's Been Built

This documents the project skeleton scaffolded from [spec1.md](./spec1.md). The
original CRUD + Generation Rule skeleton (this doc) has since been built on by ten
further steps — read those for the detail, this doc gives the overall shape (current
through Step 5; see the note at the end of this list for what's changed since):

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
- [step5-dock-driven-interaction.md](./step5-dock-driven-interaction.md) — every
  action moved off the Card/Page onto the Dock (icon-only, single consistent row);
  Pages are full-screen with up/down navigation instead of a scrolling stack; the
  Vault lives in the Dock as an IDE-style file list; Card editing opens via
  double-click/long-press and closes on click-outside; and a new `Card.savedToVault`
  flag gives the Vault a real staging relationship to what's on a Page.
- [step6-vault-sync-fixes.md](./step6-vault-sync-fixes.md) — bug fixes to keep the
  Vault panel and a Page's own Cards in sync after an edit made through either one.
- [step7-move-mode.md](./step7-move-mode.md) — Move Mode: reposition a Card within a
  Page or across Pages (including to a brand-new one) by tapping it, tapping Move,
  then tapping a destination, instead of only remove-and-re-add.
- [step8-ai-generation.md](./step8-ai-generation.md) — the real generation pipeline:
  file-based prompts with an explicit `<card>` output contract, a single streaming
  model call per generation (no more discard-and-regenerate), and a ghost card that
  auto-saves the moment its stream ends (no separate Accept/Deny review step by the
  time Step 10 below revisits it).
- [step9-interaction-overhaul.md](./step9-interaction-overhaul.md) — Tabs (a
  horizontal layer above Pages, each with its own independent Page stack), the Dock
  Cards persistent scratchpad, the Feed Input Button (replaces the old Add Card/
  Generate menu row), Vault folders, and Selection Lock (Tab/Page navigation disabled
  while anything's selected).
- [step10-rich-text-editor.md](./step10-rich-text-editor.md) — Card content is now
  HTML, edited through a real TipTap/ProseMirror WYSIWYG editor with a Dock-hosted
  formatting toolbar; embeds are a real `cardEmbed` node instead of `[[cardId]]`
  bracket tokens; diff/footnote/highlight annotations anchor against the document
  model instead of raw substrings.
- [step11-stacks.md](./step11-stacks.md) — "stack" CardType: branching alternates
  for a Card, each a real independent Card, with only the active one ever
  rendering on the Page or contributing to generation context.
- [step12-apps-and-actions.md](./step12-apps-and-actions.md) — Apps (save the
  current Tab/Page as a reusable snapshot, re-open fresh copies later) and inline
  Actions (a calibrated, clickable job button + input fields, placeable inside any
  note's rich text, driven by a small fixed job registry).
- [step13-rich-text-formatting.md](./step13-rich-text-formatting.md) — strikethrough/
  underline/links/syntax-highlighted code blocks/blockquote/horizontal rule/full
  H1-H6 headings, plus new node types: GFM tables, task lists, inline images,
  Obsidian-style callouts, KaTeX math, and live Mermaid diagram previews.
- [step14-cards-and-polish.md](./step14-cards-and-polish.md) — file Cards render
  PDFs/Markdown properly; every CardType's header behaves consistently (fullscreen/
  remove buttons, action ordering); two new CardTypes ("action", a whole-Card job
  button, and "prompt", a self-contained input/AI-response box); a Hide/Show Dock
  action finishing the previously half-built hidden-Card feature.
- [step15-rewrite-in-place.md](./step15-rewrite-in-place.md) — the Dock's magic
  button, for a single selected plain Card, now redoes that Card's own content in
  place via an instructed diff (reviewed through the existing diff UI) instead of
  generating a new sibling Card.
- [step16-prompt-card-rework.md](./step16-prompt-card-rework.md) — the "prompt"
  CardType is now a flip card with an append-only iteration history, real rich-text
  output, and four context modes (page/tab/specific cards/none); a dormant
  "selection" prompt mode gets wired up for a new text-selection quick lookup.
- [step17-multi-select-and-quotes.md](./step17-multi-select-and-quotes.md) — several
  Cards can be selected at once now; dragging text and confirming it via the Dock's
  quotation-mark action turns it into a persistent, Kindle-style highlighted "Quote";
  both feed the Dock's own prompt panel as combined context, with everything driven
  from the Dock rather than floating popups.

**Status note**: the sections below (architecture decisions, data model, API
endpoints, frontend file-by-file breakdown) describe the app **as of Step 5** and
have not been rewritten for Steps 6–17 — treat them as historical background on the
original shape, and read each linked step doc above for what actually changed. In
particular: `Card.content` is HTML, not markdown, as of Step 10; the API endpoint
table below predates `/api/tabs`, `/api/dock-cards`, `/api/folders`, `/api/apps`, and
the streaming/annotation routes added in Steps 6–17; and `PageNav.tsx` (referenced
below) was deleted in Step 9, merged into the Dock's own base bar.

As of Step 5, the foundation described by these steps is complete: adding a new card
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
  `String` column rather than Prisma's `Json` scalar), `savedToVault` (Step 5: `Boolean
  @default(true)` — whether this Card is an independent, Vault-searchable entity yet,
  or still page-local scratch content; see step5's doc §8), timestamps.
- `Page` — a stack slot: `id`, `order` (ascending bottom→top), timestamps.
- `PageCard` — join between a Page and a Card, since a Card can be opened into a Page
  and edited there without committing changes to the vault copy until explicitly
  saved. Holds `order` (position within the page) plus nullable `draftTitle` /
  `draftContent` for unsaved inline edits. This is how "Save a Card back to the vault"
  (spec1.md Part 3) is implemented: edits inside a Page write to the `PageCard`
  draft fields; `POST /page-cards/:id/save` copies them onto the underlying `Card`,
  clears the draft, and (Step 5) sets `Card.savedToVault = true`.

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
| `GET /api/cards?q=` | Vault list + search (Step 5: only `savedToVault: true` Cards) |
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
- `components/Vault/VaultView.tsx` — Step 5: a compact IDE-file-list (search bar +
  "new file" icon button in a toolbar, then flat filename rows — no bordered cards, no
  content preview), reachable only as an extension panel toggled from the Dock (the
  old standalone Pages/Vault tab is gone). "New file" creates a blank Card directly on
  the current Page and closes the panel, rather than showing a title/content form.
  Composes `Button`/`InputField`/`Icon`.
- `components/PageStack/PageStack.tsx` — Step 5: renders exactly one full-screen
  Page's Cards at a time (no title, no bordered "folio" box) — which Page, and
  navigating between them, lives in `components/PageNav/PageNav.tsx` + `App.tsx` now.
- `components/PageNav/PageNav.tsx` — Step 5, new: two arrows (up/down) rendered as a
  normal flex row between the Page content and the Dock, not a `position: fixed`
  overlay — see step5's doc §4 for why that's what makes it never overlap the Dock
  regardless of the Dock's own height. Pages are only ever added at the bottom: once
  there's nothing below the current Page, the down arrow's icon itself becomes `+`.
- `components/Card/Card.tsx` — a single Card's tap target inside a Page. Step 5: no
  more Edit button or "unsaved" Badge on the Card itself — double-click (desktop) or
  long-press (touch, manual `onTouchStart`/`onTouchEnd` timer since there's no native
  long-press event) opens the same inline editor the Dock's Edit action does, closing
  again via a click-outside `pointerdown` listener rather than an explicit Done
  button. Also gained a small fold caret (collapse/expand `.card__preview`, left of
  the title). Composes `CardShell`/`Icon`/`InputField`.
- `components/Dock/Dock.tsx` — sticky footer, state-dependent per spec1.md Part 2:
  nothing selected → just the Vault toggle; a Page selected (no Card) → Add Card/
  Delete Page; a Card selected → Edit/Save/Generate/Remove/Delete. Step 5: always
  exactly one row (`.dock__row`) — no title text in any state, and the Vault toggle is
  the first button in that same row rather than a header row of its own, so the Dock
  is a genuinely consistent height regardless of what's selected (only the Vault panel
  or a live generation preview, both temporary, ever grow it). The Save action's icon
  is `+` while there's something to commit and a disabled tick once saved — see
  step5's doc §8 for the Vault-staging flag that feeds into when that's true. The Card
  action list is still *derived* from `cardTypeRegistry`/`operationRegistry` (Step 3),
  and shows a live incremental preview (`useGeneration`) styled as a "retro terminal"
  readout (Step 4) while a generation streams in.
- `components/primitives/` — Step 3: `Button`, `CardShell`, `Badge`, `InputField`.
  Step 4 re-themed all four to styling.md's "Refined Neo-Brutalism." Step 5 added
  `Icon` (a line-icon set every button now shows instead of text — see step5's doc
  §2) and changed `CardShell` from a real `<button>` to a `<div role="button">` (a
  real `<button>` can't legally nest another `<button>`, which Card.tsx's Edit-era
  layout needed at the time and later gestures still benefit from). See its own
  `README.md`, [step4-design-system.md](./step4-design-system.md), and
  [step5-dock-driven-interaction.md](./step5-dock-driven-interaction.md).
- `i18n/` — Step 3: `en.json` (every user-facing string) + `t()`/`useTranslation()`
  (flat key lookup, no full i18n library). See its own `README.md`.
- `hooks/usePages.ts`, `hooks/useVault.ts` — data fetching + optimistic-ish mutators
  (mutate local state, call the API, then refetch) per spec1.md Part 4's guidance to
  use optimistic UI rather than blocking on every round-trip. Current implementation
  refetches after each mutation rather than doing full local reconciliation — good
  enough for MVP, worth revisiting if it feels laggy. Step 5: `usePages`' `addPage` now
  takes an optional explicit `order` (so a new Page can be placed at the bottom of the
  stack, not just appended on top) and returns the new Page's id.
- `hooks/useGeneration.ts` — Step 3: opens an `EventSource` against
  `GET /api/generate/stream/:pageCardId` for a live text preview. Read-only on the
  server side, so `App.tsx`'s `handleGenerate` still calls the original, persisting
  `POST /api/generate` afterwards — see step3's doc for the resulting "generates
  twice" tradeoff and why it exists.
- `api/client.ts` — the only module that calls `fetch`; every other frontend module
  deals purely in `@wattle/shared` types. Step 5: `createPage` takes the same optional
  explicit `order` `usePages.addPage` does.
- `styles/tokens.css` — spacing scale, `--touch-target-min: 44px` (Step 5 added
  `--touch-target-sm`/`--icon-size-sm` for the Dock/PageNav's denser buttons), type
  scale, border width/shadow tokens, and light/dark color roles (spec1.md Part 4
  "Design System From the Start"; Step 4 layers styling.md's neo-brutalist color/
  border/shadow/type values on top), consumed by every component's CSS instead of
  hardcoded pixel values.
- `App.tsx` — Step 5: no more top-level Pages/Vault tab switcher (that was never in
  spec1.md to begin with — see step4-era history). `PageStack` is the only thing in
  `.app__main`; `PageNav` and `Dock` sit below it as normal flex siblings. Owns
  `currentPageId` (which Page `PageNav` is looking at), `selectedPageCardId`, and
  `isEditing`, with `selectPageCard`/`requestEditPageCard` as the two ways selection
  changes (plain tap vs. double-click/long-press "select and edit in one action") —
  see step5's doc §7 for why those are two different functions rather than one.

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

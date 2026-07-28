# Step 12 — Apps (Reusable Tab/Page Templates) and Inline Actions

Two independent features landed in the same commit as Step 11's Stacks: a way to save
the current Tab or Page as a reusable template ("App") and re-open fresh copies of it
later, and a way to place a calibrated, clickable "do something" widget directly inside
a Card's rich text.

## Apps

A poor-man's project-scaffold/macro system: turn the current Tab (every Page in it) or
a single Page into a named, versioned snapshot, then instantiate brand-new, fully
independent Cards/PageCards/Pages from it on demand — never a live reference back to
the originals.

### Data model

- **`packages/shared/src/registries/appSnapshot.ts`** — `appCardSnapshotSchema =
  { typeId, title, content, metadata, stackMembers? }` (`stackMembers` populated only
  for a `typeId: "stack"` Card — every alternate, in order, `metadata.stack.activeIndex`
  carried through unchanged). `appSnapshotV1Schema` is a `z.discriminatedUnion("scope",
  ...)`: scope `"page"` → `{ cards: AppCardSnapshot[] }` (one Page's ordered Cards);
  scope `"tab"` → `{ pages: { cards: AppCardSnapshot[] }[] }` (every Page in that Tab,
  each with its own ordered Cards). `migrateAppSnapshot()` mirrors `cardMetadata.ts`'s
  version-dispatch upgrade pattern.
- **`App`** (`packages/api/prisma/schema.prisma`, migration `20260724065129_add_apps`)
  — `id, slug?, name, description?, scope, isCore, sortOrder, snapshot (JSON string),
  timestamps`. No foreign keys to any live Tab/Page/Card row — fully decoupled by
  design, so deleting the original Tab/Page an App was saved from never touches the
  App itself.

### Backend (`appService.ts`, `routes/apps.ts` at `/api/apps`)

- `buildCardSnapshot` captures each PageCard's **draft-aware** title/content (draft
  wins over the vault Card's committed values, same rule `pageCardService.saveToVault`
  uses) — the only recursion is into a Stack container's own members; a plain note's
  embedded Cards (`<wattle-embed>` tags inside its own content) are captured verbatim,
  not walked or deep-cloned (see Known limitations).
- `createApp`/`updateAppSnapshot`/`deleteApp` — straightforward CRUD, with `isCore`
  Apps (the three seeded ones, below) rejecting update/delete.
- `instantiateCard` — always creates **brand-new** rows (`savedToVault: false`, same
  as any other freshly-added Card) — opening the same App twice never shares a Card
  between the two copies (except the un-deep-cloned embed case above). A Stack
  snapshot's `stackMembers` become new Cards + `StackMember` rows, with
  `activeIndex` re-clamped against however many members actually got created.
- `openApp(id, input)`, one transaction: scope `"tab"` creates a brand-new Tab plus
  one new Page per snapshotted page; scope `"page"` requires a target `tabId` and
  appends one new Page to it. Both return `{ scope, tabId, pageId }`.
- `packages/api/prisma/seed.ts` — seeds three **core** Apps (`isCore: true`, not
  deletable/editable): `blank` (empty page), `note` (one blank note), `chat` (a
  Tab-scoped App: a Page with a hidden "System Prompt" note stacked above a blank
  note — built so the reveal-hidden toggle can show the prompt, and normal Page
  generation reads it as context above the blank note). Not wired into any npm
  lifecycle script — run manually (`npm run db:seed`).

### Frontend

`AppBrowser.tsx` (fetch-on-mount list, Open always available, Edit hidden for core
Apps) and `SaveAsAppModal.tsx` (name + optional description — only shown for a
brand-new save; re-saving an App already being edited skips the modal and calls
`updateAppSnapshot` directly) are both centered-overlay dialogs, same convention as
`CardLinkPicker.tsx`. `App.tsx` owns `editingAppId`/`editingAppName` (set only by the
browser's Edit action) and `appBrowserOpen`; `handleOpenApp` is shared by Open, Edit,
and the `openApp` action job (below). The Dock shows a persistent "editing App" badge
whenever `editingAppName` is set; the Tabs/Pages panels each get their own "Save as
App" button.

**"Editing" an App is not in-place snapshot editing** — it's "open a live
instantiated copy, then let a later Save-as-App overwrite the same App row using
whatever Tab/Page is current at that moment." There's no check tying `editingAppId`
to the specific Tab/Page that was actually opened for editing (see Known
limitations).

### Known limitations

- Embedded Cards nested inside a snapshotted note's own rich-text content are not
  deep-cloned — every open of that App still points its embed at the *same original*
  Card, contradicting `openApp`'s "brand-new rows throughout" intent for this one
  case; if the original is later deleted, the App's embed becomes dangling.
- Re-saving an "edited" App uses whatever Tab/Page is current at click time, not the
  one that was actually opened for editing — navigating away mid-edit and then
  hitting Save-as-App would silently overwrite the App with unrelated content.
- Validation errors (missing name, wrong scope, core-App mutation) are plain
  `Error`s, not `ZodError`s, so they surface as an uncaught 500 rather than a 400.
- No rename/duplicate/folder, no search/filter, no version history (a re-save
  overwrites the previous snapshot outright), and an App's scope is fixed at
  creation.

## Inline Actions

A fixed, closed job registry (`lib/actionJobs.ts` — "deliberately no generic 'run
any operation' path") drives two new TipTap nodes usable inside any note's rich
text: `actionButton` (a calibrated button that fires one job) and `actionField` (a
text/textarea/number/slider/toggle/select input that feeds a sibling button's job
params). Both are `group: "block", atom: true` nodes (`wattle-action`/`wattle-field`
tags — not starting with "card", same collision-avoidance as `cardEmbed`'s
`wattle-embed`), added to `baseRichTextExtensions` (shared/server-side schema) and
extended with a NodeView client-side, the same split every other rich-text node in
this app uses.

### The calibration/runtime-value split

An `actionButton`'s attrs (`label`, `jobId`, `jobParams` — JSON-encoded, since
TipTap attrs must be primitives) and an `actionField`'s attrs (`kind`, `label`,
`placeholder`, `min`/`max`/`step`, `defaultValue`, `options`) are all **author-time
configuration**, persisted into the stored document and edited via anchored popovers
(`ActionButtonConfigPopover.tsx`, `ActionFieldConfigPopover.tsx`) that only show
while the Card is in edit mode. A field's **runtime value** (what a user actually
types), by contrast, is plain local `useState` — **never persisted** — registered
into a per-Card map (`CardEditingContext`'s `registerActionFieldValue`, keyed by the
field's own ProseMirror document position) so a sibling button can read every
currently-mounted field's value, in document order, at the instant it's clicked
(`getActionFieldValues()`). Reloading a Card resets every field back to its
configured default.

### The job registry (`lib/actionJobs.ts`)

`ActionJobId = "createCard" | "promptCard" | "openApp" | "newBlankPage" |
"newBlankTab" | "navigatePage" | "removeCard" | "saveCard"`. `runActionJob(pageCard,
jobId, jobParams, ctx)` is a pure dispatcher — `App.tsx`'s `handleRunActionJob` is
the one place that implements `ActionJobContext`, mapping each job onto an existing
App.tsx function (`createCardInPage`, the shared page-level `generation.start(...,
standalone)` for `promptCard`'s two context modes, `handleOpenApp`,
`handleAddPageAtBottom`, a new `handleAddBlankTab`, `navigateUp`/`navigateDown`, and
direct `api.removePageCardFromPage`/`savePageCardToVault` calls for the two
"target another Card on this Page" jobs, both silently no-op on a stale/removed
target). `promptCard`'s "on its own" context mode is the same `standalone` flag the
Step 13 "prompt" CardType's own generation later reuses.

### Where this is (and isn't) wired up

`ownerPageCard`/`onRunActionJob`/`generatingPageCardId` are only ever provided by
`Card.tsx` at depth 0 (a real top-level Page Card) — an `actionButton` nested inside
an *embedded* Card, or inside a Stack alternate's own content (`StackBody.tsx` never
threads these into its `CardRichText`), renders but is structurally inert: there's
nothing for it to call. Same "disabled, not broken" contract an unrecognized `jobId`
already has.

### Known limitations

- Action-field values are never persisted, by design — no "remember what I typed."
- "Running" state is per-Card (`generatingPageCardId === ownerPageCard.id`), not
  per-button — a Card with multiple action buttons disables all of them while any
  one job is in flight.
- Inline actions only function inside a top-level Page Card's own content — inert
  inside embeds and Stack alternates (not documented as intentional for the Stack
  case; simply never wired).
- `promptCard` shares the single page-level `generation` hook with the Dock's own
  Generate action — only one can stream at a time.
- `saveCard` can silently fail with no user feedback if the target Card currently
  has a blank title (`pageCardService.saveToVault`'s title-required guard throws,
  and `handleRunActionJob`'s `onSaveCard` swallows the error).
- Adding a new job requires code changes in three places (`actionJobs.ts`,
  `ActionJobFields.tsx`, `App.tsx`) — not just registry configuration, by design.

## Files touched

**Apps** — `packages/shared/src/registries/appSnapshot.ts` (new), `src/types.ts`
(`App`, `AppWithSnapshot`, `CreateAppInput`, `UpdateAppSnapshotInput`,
`OpenAppInput`, `OpenAppResult`), `packages/api/prisma/schema.prisma` + migration
`20260724065129_add_apps` (new), `prisma/seed.ts` (new), `src/services/
appService.ts` (new), `src/routes/apps.ts` (new, mounted in `app.ts`),
`packages/web/src/components/Apps/{AppBrowser,SaveAsAppModal}.tsx` + `Apps.css`
(new), `src/App.tsx` (editing/browser state and handlers), `src/components/Dock/
Dock.tsx`/`.css` (editing badge, Save-as-App wiring), `TabsPanel.tsx`/`PagesPanel.tsx`
(Save as App buttons), `FeedInputButton.tsx` (`onNewFromApp`), `api/client.ts`
(`listApps`/`getApp`/`createApp`/`updateAppSnapshot`/`deleteApp`/`openApp`),
`i18n/en.json` (`apps.*`).

**Inline Actions** — `packages/shared/src/richText/{actionButtonNode,
actionFieldNode}.ts` (new), `src/richText/extensions.ts` (registers both),
`packages/web/src/lib/{actionJobs,actionFieldDefaults}.ts` (new),
`src/components/Card/richtext/{ActionButtonNodeView,ActionFieldNodeView,
ActionButtonConfigPopover,ActionFieldConfigPopover,ActionFieldKindPicker}.tsx` +
`ActionNodes.css` (new), `CardEditingContext.tsx` (owner/job/field-registry fields),
`CardRichText.tsx` (the field-value position map), `richtext/extensions.ts`
(NodeView wiring), `src/components/Card/types/action/{ActionJobFields,
EmbeddableTextField}.tsx` + `.css` (new), `Card.tsx` (threads the new context at
depth 0), `Dock.tsx` (insert-button/insert-field/insert-card-link actions),
`App.tsx` (`handleRunActionJob`, `handleAddBlankTab`), `api/client.ts`
(`removePageCardFromPage`, `savePageCardToVault`), `primitives/Icon.tsx`
(`insertButton`, `insertTextbox`), `i18n/en.json` (`actionCard.*`, `actionField.*`).

## Verified

Both features build and typecheck clean (`tsc`/`vite build` across all three
packages). No in-browser click-through verification recorded for either feature in
this pass.

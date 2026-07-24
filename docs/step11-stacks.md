# Step 11 — Stacks: Branching Alternates for a Card

A "stack" is a new CardType whose Card holds no title/content of its own — instead it
owns an ordered list of **alternates** (`StackMember` rows), each one a real, independent
Card, of which exactly one is "active" (in view) at a time. Turning a Card into a Stack
branches it: the original Card becomes alternate #1, and `+` appends more, each
independently editable/saveable/generatable, with only the active one ever contributing
to generation context or rendering on the Page.

This built on top of an existing, previously-unwired prototype (`CardStackRail.tsx`,
T0 — mock data, no backend) rather than a separately pasted spec that described a
different vertical-scroll/convert-on-"+" design; that choice was made explicitly (the
prototype's horizontal exclusive-alternate model won) rather than discovered along the
way. Landed in three passes in the same session: T1 wired the prototype to real data;
T2 reworked the rail into a corner control cluster and added Make-a-Stack/Close-Stack/
Remove to the Dock; a final pass added in-place AI generation for a blank alternate,
fold/collapse, and made the Dock's own Generate action stack-aware.

## Data model (`packages/api/prisma/schema.prisma`, migration `20260720091227_add_stack_member`)

```prisma
model StackMember {
  id, stackCardId, cardId (@unique), order
  draftTitle, draftContent
  createdAt, updatedAt
  stackCard Card @relation("StackContainer", onDelete: Cascade)
  card      Card @relation("StackMemberCard", onDelete: Cascade)
}
```

- `Card` gained the two relation back-references (`stackMembers`/`memberOfStack`).
- `cardId` is `@unique` — a Card can belong to at most one Stack, ever; this is also
  what makes a "close stack" (below) safe: deleting just the container cascades away
  every `StackMember` row on the container side of the relation, but a member's own
  Card is untouched (a separate relation), so it survives as an ordinary orphaned
  vault Card.
- `cardMetadataV1Schema` (`packages/shared/src/registries/cardMetadata.ts`) gained an
  optional `stack: { activeIndex: number }`, set only on `typeId: "stack"` Cards —
  the one place this is written is `stackService.writeActiveIndex`, which clamps it
  against however many members currently exist so an index can never outlive the
  member it pointed to.
- `stackCardTypeDefinition` (`packages/shared/src/registries/definitions/
  stackCardType.ts`) registers `"stack"` with `supportsOperations: []` — the
  container has no title/content of its own to edit/generate/rename/save, so no
  Operation applies to it at all; its two real actions (Move, Delete/Close Stack)
  are ad hoc Dock actions, same convention as every other structural action.

## Backend

- **`stackService.ts`** (new) — the whole Stack surface, ad hoc (not Operation-registry,
  same reasoning as Move/remove-from-page: these apply the same way regardless of a
  member's own CardType):
  - `createStackInPage` — new container + one blank member, both page-local scratch
    (`savedToVault: false`).
  - `convertCardToStack` — turns an *existing* PageCard into a Stack in place: creates
    a container, wraps the existing Card as member #1 (carrying over any draft the
    PageCard had), then repoints that same PageCard row's `cardId` at the new
    container. Reuses the PageCard row itself (same id/order) rather than delete +
    recreate, so the Stack lands in exactly the position the original Card was in.
  - `addMember` / `updateMemberDraft` / `saveMemberToVault` / `removeMember` — a
    member's own draft/save lifecycle, mirroring `pageCardService`'s. `removeMember`
    auto-deletes the whole (now-empty) Stack if it was the last member.
  - `setActiveIndex` / `getStackData` — the rail's ←/→, and `GET /api/stacks/:id`'s
    full read model.
  - `closeStack` — the *safe* removal: promotes every still-unsaved member to the
    vault first (same "never silently destroy unsaved work" rule
    `pageCardService.removeFromPage` uses), then deletes just the container. Members
    survive as ordinary vault Cards.
  - `deleteStack` — the *destructive* removal: deletes the container and every
    member's own vault Card. Explicit, separate action from `closeStack`, same
    "safe vs. destructive" split `removeFromPage`/`deleteEntirely` already have for a
    plain Card.
  - No code path anywhere sets a member's `typeId` to `"stack"` — nesting is
    prevented structurally (fresh members always get `defaultMetadata()`), not by a
    validation check.
- **`routes/stacks.ts`** (new), mounted at `/api/stacks`: `POST /`, `POST /convert`,
  `GET /:id`, `PUT /:id/active`, `DELETE /:id/close`, `DELETE /:id`, `POST /:id/members`,
  `PATCH /members/:id`, `POST /members/:id/save`, `DELETE /members/:id`.
- **`generationService.ts`** — `GenerationTarget` gained a third variant,
  `{ type: "stackMember"; memberId }`, alongside the existing `card`/`page` ones:
  - `assembleContextForTarget` resolves a `stackMember` target to its *container's*
    own PageCard position (same page, same "everything above" cutoff a card-level
    target at the container would use) — generating into one alternate never sees
    the Stack's other alternates as context, any more than a normal target sees
    itself.
  - `resolveContextContent` (pre-existing, from when Stacks first got generation-context
    support) already resolved a Stack PageCard's contribution to its *active* member's
    content instead of the container's permanently-blank one — unchanged here, still
    what makes "the Stack in view" mean something during a normal Page generation.
  - `streamGenerationForStackMember` / `persistGeneratedToStackMember` (new) —
    the Stack counterpart to `streamGeneration`/`persistGeneratedCard`, but
    `persistGeneratedToStackMember` never creates a new PageCard: the member already
    exists (blank, added via the rail's "+"), so it writes the generated title/content
    straight onto that member's own Card and clears its (empty) draft. Deliberately
    ignores the model's suggested root `cardType` for the member itself — unlike a
    plain generated Card, a member's own type must never move off `"note"` — that
    field only still applies to any nested `<card>` blocks materialized as embeds.
  - `routes/generate.ts`: `GET /stream/stack-member/:memberId`, and
    `POST /accept` now branches on `req.body.memberId` before falling through to the
    existing `card.generateAccept` Operation (the `memberId` branch is ad hoc, for the
    same reason every other Stack action is — a `StackMember` isn't a Card a
    `CardTypeDefinition.supportsOperations` gate would apply to).

## Frontend

### `useCardStack.ts` (new)

The Stack's own data hook — `data`/`loading`/`refresh`/`goPrevious`/`goNext`/
`addMember`/`updateActiveDraft`/`saveActive`/`removeActive`. Refetches after every
mutation except `updateActiveDraft` (fires on every keystroke, so it patches local
state immediately and sends the PATCH in the background — same reasoning as
`usePages.ts`'s own draft handling). `addMember` returns the created member (not just
`void`) so a caller that needs its id right away — the Dock's stack-aware Generate,
below — doesn't have to wait a render cycle to read it back out of `data`.

`removeActive`, when removing the last member auto-deletes the whole Stack
server-side, calls `notifySaved(stackCardId)` (`cardStore.ts`) — the same "tell
`usePages` to refetch" signal an embed edit already uses — so the now-nonexistent
Stack's PageCard actually disappears from the Page instead of a zombie component
sticking around and 500ing on the next action against it. *(This was a real bug found
mid-build: without it, removing a Stack down to zero members left a stale card on
screen that threw a Prisma "record not found" the moment you touched its rail again.)*

### `CardStackRail.tsx` — T1 → T2

T1 wired the T0 prototype to real props (no more `MOCK_MEMBERS`). T2 reworked it
twice more, per direct feedback:

- No longer its own bordered/shadowed "card within a card" row above the header —
  it's a small ghost-button control cluster (◂ / n-of-total / +▸), sized to
  `--touch-target-sm`/`--icon-size-sm` (the same "secondary, frequently-reached
  control" tier the Dock's own row and page-nav arrows use), rendered as a *sibling*
  of `.card__header-start` inside the Card's own `.card__header` row — the title
  input's own markup/styling is untouched.
- **A Stack with exactly one member shows only the `+`** — no back-caret, no "1/1"
  counter, nothing to navigate or count with just one. It reads as a plain Card.
  Back-caret and the count only appear once a second member actually exists — a
  Stack that hasn't branched yet shouldn't look branched.
- `disabled` prop locks the whole rail while a generation is streaming into the
  active member (below), so the active member can't change out from under it
  mid-stream.

### `StackBody.tsx` / `StackView.tsx` / `StackEditor.tsx` / `StackPickerTile.tsx` (new)

`StackBody` is the shared render logic (both View and Editor render it — a Stack
container has nothing that meaningfully differs between "selected" and "selected +
editing", so there's no reason for two implementations). In practice `StackEditor` is
unreachable: `App.tsx`'s `toggleSelectPageCard` special-cases a stack container to
never enter `editingPageCardIds` on a second tap (see below), so `PageCardSlot`
always renders `StackView`. `StackEditor` still exists only because
`cardTypeUiRegistry.register` requires one for every type.

Renders, top to bottom:

1. `.card__header`: a fold caret (new — same `collapsed` local state, same
   `card__caret-btn`/`card__caret` classes and `stopPropagation` `Card.tsx` uses,
   so a Stack folds exactly like a plain Card does — header always visible, only the
   body beneath folds away), the title `InputField` (always directly editable — a
   member has no separate edit mode, same "writes straight through" precedent embeds
   already use, but *does* still stage an unsaved draft until Saved, since a fresh
   member starts as page-local scratch content), then `CardStackRail`.
2. Below the header, one of three things, depending on state:
   - **Streaming**: `GhostCard` (reused as-is from the page-level generation flow —
     it only needs `{nodeId, nodes}`, nothing about it assumes it's a top-level
     PageCard slot).
   - **Blank** (no title, no content, no draft — i.e. a freshly-added member never
     touched since): a `FeedInputButton`, `showMoreOptions={false}` (its "Open from
     Vault"/"Upload File"/card-type-picker submenu doesn't apply to filling in a
     Card that already exists as this alternate — see Known limitations).
   - **Otherwise**: the normal `CardRichText` editor.

Each `StackBody` instance owns its **own** `useGeneration()` hook — not App.tsx's
page-level one. A page-level generation always inserts a new sibling PageCard; a
Stack alternate's generation fills that alternate's own content in place, which needs
its own target type and its own ghost-card render slot (item 2 above), not the
`PageStack`-level `ghostCard` prop.

### `activeStackRegistry.ts` (new)

A small external store (`useSyncExternalStore`, same shape as the pre-existing
`activeEditorRegistry.ts`) — `StackBody` publishes `{ save, remove, isGenerating,
generateNewAlternate, stopGenerating, hasUnsavedDraft }` for its active member while
`selected` is true; `Dock.tsx` reads it to render Save/Remove/Generate for whichever
Stack is currently selected. Needed because the Dock is a *sibling* of wherever a
Stack actually lives in the tree, not an ancestor — there's no plain prop path down to
it, same reason the rich-text formatting toolbar's `activeEditor` works this way.
Guards its cleanup effect against clearing a *different* Stack's fresher registration
(`stackCardId` identity check), same guard `CardRichText.tsx`'s unmount uses.

### `Dock.tsx`

New/changed actions in the `selectedCards.length > 0` row:

- **Make a Stack** (`stackAdd` icon, new — two offset card outlines + a plus badge) —
  any single non-Stack selection; calls `stackService.convertCardToStack`.
- **Remove** — any non-Stack selection; calls the pre-existing but previously
  unwired `pageCardService.removeFromPage` (the route existed since Step 9-era
  work; nothing in the UI ever called it until now).
- **Close Stack** / **Delete Stack** — a single selected Stack: the safe/destructive
  pair described above.
- **Save**/**Remove** *for the active alternate* — reads `activeStackRegistry`, not
  the generic `save` action (which is gated on operation id `"card.save"`, which a
  Stack container never supports — `supportsOperations: []`).
- **Generate**, when a Stack is selected, targets the Stack's own generation instance
  via `activeStackRegistry.generateNewAlternate` instead of App.tsx's page-level
  `onGenerateSelected`: it appends a new alternate and streams into *that*, rather
  than inserting a sibling PageCard the way Generate does for every other CardType.
  The action's icon/spinner/Stop wiring reads `activeStack.isGenerating` instead of
  the page-level `generating` prop while a Stack is selected, so it correctly
  reflects that Stack's own in-flight generation.

Also: `App.tsx`'s `toggleSelectPageCard` (a second tap on an already-selected Card
normally enters `editingPageCardIds`) now no-ops for a Stack container specifically.
*(Second bug found mid-build: entering "editing" flipped `isEditingActive` true,
which collapses the Dock's whole row down to just the rich-text formatting toolbar —
correct for a plain Card mid-edit, but a Stack container has nothing of its own to
edit, so this permanently hid Move/Delete Stack/Generate the moment you clicked into
a Stack's title or body a second time, with no visible explanation.)*

### `CardRichText.tsx` — a general fix, exposed by Stacks

The effect that syncs an externally-changed `content` prop into the TipTap editor
(originally written for the rare cross-tab-edit case) now also fires every time a
Stack's active alternate switches — a much more frequent trigger. Calling
`editor.commands.setContent(...)` synchronously from inside that passive effect
would `flushSync` (via tiptap-react mounting an embedded card's NodeView) from
*inside* a React lifecycle method, which React logs as an error. Fixed by deferring
that call one microtask (`queueMicrotask`, with an `editor.isDestroyed` guard) — same
content, no visible delay, no illegal nested flush. General fix, not Stack-specific;
it also protects the original cross-tab case.

### `FeedInputButton.tsx` — generalized for reuse

`onOpenVault`/`onUploadFile` are now optional, and a new `showMoreOptions` prop
(default `true`, unchanged for every existing call site) hides the ellipsis
button/popup entirely rather than opening onto Vault/Upload/type-picker options that
don't apply to a Stack alternate's blank-state Feed Input Button.

### `useGeneration.ts` — third target type

`GenerationTarget` gained `{ type: "stackMember"; memberId }` alongside `card`/`page`;
`startForStackMember(memberId, instruction?)` opens the new stream endpoint, and
`finalize()`'s accept call branches to send `{ memberId }` instead of
`{ pageCardId }`/`{ pageId }`. Each `StackBody` instantiates its own copy of this
hook (see above) — it is not shared with App.tsx's page-level instance.

## Files touched

**`packages/api`**: `prisma/schema.prisma` + migration `20260720091227_add_stack_member`
(new `StackMember` model, `Card` back-relations), `src/services/stackService.ts` (new),
`src/routes/stacks.ts` (new), `src/app.ts` (mounts it), `src/services/
generationService.ts` (`stackMember` target, `streamGenerationForStackMember`,
`persistGeneratedToStackMember`), `src/routes/generate.ts` (`/stream/stack-member/:id`,
`/accept`'s `memberId` branch).

**`packages/shared`**: `src/registries/cardMetadata.ts` (`stack.activeIndex`),
`src/registries/definitions/stackCardType.ts` (new), `src/registries/init.ts`
(registers it), `src/types.ts` (`StackMember`, `StackMemberWithCard`, `StackData`).

**`packages/web`**: `src/hooks/useCardStack.ts` (new), `src/hooks/useGeneration.ts`
(`stackMember` target), `src/lib/activeStackRegistry.ts` (new),
`src/components/CardStack/CardStackRail.tsx` / `.css` (T1 → T2 rewrite),
`src/components/Card/types/stack/{StackBody,StackView,StackEditor,StackPickerTile}.tsx`
(new), `src/components/Card/richtext/CardRichText.tsx` (deferred `setContent`),
`src/components/FeedInputButton/FeedInputButton.tsx` (`showMoreOptions`, optional
vault/upload handlers), `src/components/PageStack/PageStack.tsx` (`onAddStack` passed
through to `FeedInputButton`), `src/components/Dock/Dock.tsx` (Make a Stack/Close
Stack/Remove/stack-aware Generate/Save-Remove-active-alternate),
`src/components/primitives/Icon.tsx` (`stackAdd`), `src/registries/cardTypeUiInit.ts`
(registers Stack's View/Editor/PickerTile), `src/App.tsx` (`handleAddStackToCurrentPage`,
`handleConvertToStack`, `handleCloseStack`, `handleDeleteStack`, `handleRemoveSelected`,
`toggleSelectPageCard`'s Stack no-op guard), `src/api/client.ts` (every `/stacks/*`
call, `removePageCardFromPage` finally wired up, `acceptGeneration`'s `memberId`
target), `src/i18n/en.json` (`dock.action.{deleteStack,closeStack,makeStack}`,
`cardStack.{save,removeMember}`).

## Known limitations / deliberate scope cuts

- A blank alternate's Feed Input Button has no "Open from Vault"/"Upload File"/
  card-type-picker — none of them apply to filling in a Card that already exists as
  this alternate (picking an *existing* vault Card to use as an alternate would need
  its own feature — reassigning a Card's `memberOfStack`, plus vault-picker plumbing
  reachable from inside `StackBody` — not built).
- Generate, whether from the rail/Feed-Input-Button on a blank alternate or from the
  Dock while a Stack is selected, always produces a **new** alternate — there's no
  "regenerate the current one in place."
- No multi-level nesting: enforced structurally (no code path ever sets a member's
  `typeId` to `"stack"`), not by a runtime check — this also means a model that
  hallucinates `cardType: "stack"` for a *plain* Card's generation (unrelated to
  Stacks) would still succeed today, since `"stack"` is now a registered CardType id;
  pre-existing gap, not introduced or closed by this work.
- No drag-reorder of alternates within a Stack — only append (`+`) and remove.
- Multi-tab/multi-window sync for a Stack's alternates works the same (fetch-on-
  mutation) way the rest of the app does — no live push between two open views of the
  same Stack.

## Verified

Full monorepo build (`tsc` across all four packages + `vite build`) passes clean after
every pass. Direct HTTP-level testing (`curl` against the running dev API, mirroring
exactly what the frontend sends) covered: create/convert/add-member/switch-active/
edit-draft/save/close/delete, generation-context correctly resolving to the active
member's content, streaming (`GET /generate/stream/stack-member/:id`) against the
dev model provider, accept (`POST /generate/accept` with `memberId`) writing the
generated title/content onto the member's own Card without touching its `typeId`, and
the last-member-removed auto-delete path (reproduced the exact "phantom Card" 500 this
surfaced, confirmed the fix resolves it). UI-level verification (browser clicks,
screenshots) was done for the earlier passes of this work via the Chrome extension;
later passes in this same session (fold, stack-aware Generate) landed after the
extension disconnected and were not re-verified visually — worth a manual pass before
calling this fully done.

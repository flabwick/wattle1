# Adding features — and keeping the AI prompts honest

This app has several places where an LLM is told, in plain English, what Wattle is
and what it can do — the system prompts under `packages/prompt-engine/prompts/` and
`packages/prompt-engine/prompts/action-script/system.md`. None of that is enforced
by the type system. It is entirely possible to add a new CardType, Operation, or
action job correctly — the app builds, the feature works — and still leave one of
those prompts describing a version of Wattle that no longer exists. This doc is the
checklist that closes that gap. Read it *before* adding a CardType, Operation, or
action job, not after something you built accidentally goes stale.

The registries themselves — the actual APIs you register against — are documented
in [`packages/shared/src/registries/README.md`](../packages/shared/src/registries/README.md)
(`CardTypeRegistry`, `OperationRegistry`) and, for the two client-side registries,
inline in [`packages/web/src/registries/cardTypeUi.ts`](../packages/web/src/registries/cardTypeUi.ts)
and [`packages/web/src/lib/actionJobRegistry.ts`](../packages/web/src/lib/actionJobRegistry.ts).
This doc is the cross-cutting checklist that ties them together with the prompts —
it deliberately doesn't repeat the mechanical "here's the interface, here's where to
register it" instructions those files already have.

## The four prompt-relevant registries, at a glance

| Registry | Lives in | What it's for |
| --- | --- | --- |
| `CardTypeRegistry` | `@wattle/shared` | What data a kind of Card holds, and which Operations it allows. |
| `CardTypeUiRegistry` | `@wattle/web` | What to actually render for a CardType (View/Editor/PickerTile). |
| `OperationRegistry` | `@wattle/shared` (type) / `@wattle/api` (real entries) | Named server-side mutations, independent of any one HTTP route. |
| `ActionJobRegistry` | `@wattle/web` | The vocabulary of steps an "action" Card's button (or an inline actionButton) can run. |

## Checklist: adding a new CardType

1. Follow the mechanical steps in `packages/shared/src/registries/README.md`
   ("Adding a new CardType") and `packages/web/src/registries/cardTypeUi.ts`'s own
   doc comments (the View/Editor/PickerTile triplet, registered in
   `cardTypeUiInit.ts`).
2. **Does a generation (the Feed Input Button's Circle, or the Dock's Generate
   action) need to be able to produce this CardType?** If so, edit
   `packages/prompt-engine/prompts/generate/system.md`'s rule 4 — right now it just
   says `type` should default to `"note"` "unless you have a specific reason,"
   without naming any other type. There's no auto-generated list backing this; if
   you want a model to deliberately choose your new type under some condition, you
   have to write that condition into the prompt yourself.
3. **Can this CardType's content be validly summarized, diffed, footnoted, or
   highlighted the same way a note's plain HTML content can?** If your CardType's
   `dataSchema` holds something that isn't ordinary rich-text `content` (e.g. the
   "action" CardType's `metadata.action.steps`, or "search"'s saved query), the
   annotation processes (`prompts/diff/`, `prompts/footnote/`, `prompts/highlight/`)
   and the Nearby summary (`prompts/summary/system.md`) are working from `content`/
   plain-text only — they don't know your new structured data exists. Usually this
   is fine (those processes simply have nothing to do on such a Card), but if your
   CardType's `content` field is used unusually, check whether any of these four
   prompts implicitly assume "content" means "the whole story."
4. **Should an action-script step be able to create/target this CardType?** See the
   Action job checklist below — `createCard`'s own `typeId` field
   (`actionJobRegistry.ts`) already accepts any string, so a script *can* already
   name your new type id without any change on your part. Nothing to do here unless
   you want the model to be steered toward or away from using it — see
   `packages/prompt-engine/prompts/action-script/system.md`'s static prose.

## Checklist: adding a new Operation

Operations (`packages/api/src/operations/*.ts`) are server-side mutations, not
directly LLM-facing — no system prompt documents "what Operations exist." The one
thing to check:

1. Follow `packages/shared/src/registries/README.md`'s "Adding a new Operation".
2. **If this Operation is also exposed as an action job** (see below) — i.e. you
   want an action-script step or an inline actionButton to be able to trigger it —
   that's a *separate* registration in `ActionJobRegistry`, not automatic. Adding an
   Operation alone does not make it scriptable.

## Checklist: adding a new action job (`ActionJobRegistry`)

This is the registry the action-script system prompt
(`packages/prompt-engine/prompts/action-script/system.md`) is generated *from* —
most of the work of keeping that prompt accurate is already done for you by
`packages/web/src/lib/actionScriptPrompt.ts`'s `buildActionScriptActionsDoc`, which
renders every registered job's id, label, and fields into the prompt's `ACTIONS`
section automatically, every time it's called. Concretely:

1. Register the job in `actionJobRegistry.ts` (see
   `packages/shared/src/registries/README.md`'s own "Adding a new action job"
   section for the circular-import caveat around `generateSteps`-shaped jobs).
2. **You do not need to hand-edit `action-script/system.md`** for an ordinary new
   job with existing field kinds (`text`, `richtext`, `select`, `cardPicker`,
   `vaultCardPicker`, `pagePicker`) — it's picked up automatically the next time the
   prompt is compiled.
3. **You DO need to touch `actionScriptPrompt.ts` and `action-script/system.md`**
   if either is true:
   - Your job needs a new field *kind* (not one of the six above) — add a case to
     `actionScriptPrompt.ts`'s `describeField` documenting how to write it in
     script text, and add the matching parsing logic to
     `packages/web/src/lib/actionScript.ts`'s `parseActionScript`.
   - Your job's behavior needs explaining beyond "id, label, its fields" — e.g. the
     way `openTemplate` is excluded entirely from the script vocabulary because a
     Template id can't be named from text (see `actionScript.ts`'s own doc
     comment). Add a line to `action-script/system.md`'s static prose (the ACTIONS
     section is generated, but the surrounding SYNTAX/OUTPUT/EXAMPLE sections are
     hand-written and can call out special cases).
4. If your job is meant to be reachable from an inline `actionButton` rich-text
   node as well as the "action" CardType's own step list, no extra registration is
   needed — both consume the same `ActionJobRegistry` through
   `ActionStepFields.tsx`.

## The prompt files, and what invalidates each one

| Prompt file | Goes stale when… |
| --- | --- |
| `generate/system.md` | The set of CardTypes a generation should be able to choose changes; the allowed HTML tag set in a Card's `content` changes (`packages/shared/src/richText/`); the embed syntax changes. |
| `selection/system.md`, `interactive/system.md` | Same `content`/tag-set/embed concerns as `generate/system.md` — they share its output contract. |
| `diff/system.md`, `diff/system-instructed.md`, `footnote/system.md`, `highlight/system.md` | The shape of `content` a Card can hold changes; the anchor/JSON entry format these processes emit changes (`src/annotationParser.ts`). |
| `summary/system.md` | Rarely — it only reads plain text and produces plain text. Mostly stable across CardType/Operation changes. |
| `action-script/system.md` | Its static prose (not the auto-generated ACTIONS section) needs updating per the Action job checklist above — new field kinds, or a job whose behavior isn't self-explanatory from its own fields. |

## Why this doc exists instead of a lint rule

There's no automated check that catches a stale prompt — the failure mode is "the
app works fine, the model just gives worse or wrong answers," which nothing in CI
would flag. Short of writing a model-behavior test suite, the checklist above is
the mitigation: read it, and the relevant file's own doc comments, before adding a
CardType/Operation/action job, not after.

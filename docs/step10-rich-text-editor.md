# Step 10 — Rich Text (TipTap) Card Editor

Replaces the regex-based plain-text editor (`CardContentEditor.tsx` split a Card's
`content` string on `[[cardId]]` tokens into text segments, each its own auto-growing
`<textarea>`) with a real TipTap/ProseMirror WYSIWYG editor: Card content is now
**HTML**, embeds are a real node type instead of bracket syntax, formatting lives in a
Dock-hosted toolbar, and diff/footnote/highlight annotations anchor against the
document model instead of raw substrings. Landed in five stages (Foundation → Editor
rewrite + migration → Dock toolbar → Annotation rework → Generation prompt updates),
committed together with Step 9's interaction overhaul (`89dd574`), plus two follow-up
fixes made immediately after in the same session (Dock toolbar title-field gating +
back-caret, and the ghost card's streaming autoscroll — see their own sections below).

## Packages

- `@tiptap/core`, `@tiptap/pm`, `@tiptap/html` → `packages/shared` (schema + shared
  plain-text/anchor utilities, used headlessly by both `web` and `api`).
- `@tiptap/react`, `@tiptap/starter-kit` → `packages/web`.
- `happy-dom` → `packages/api` (a real dependency, not dev-only) — `@tiptap/html`'s
  Node export needs a DOM implementation to run `generateHTML`/`generateJSON` outside
  a browser; this is the officially-supported path for server-side TipTap parsing.

## 1. Embed representation — the `cardEmbed` node (`packages/shared/src/richText/`)

`[[cardId]]` tokens are gone. `cardEmbedNode.ts` defines a block-level atom node
(`group: "block", atom: true`) that round-trips through a `<wattle-embed
data-card-id="...">` HTML tag — **deliberately not `<card-embed>`**: prompt-engine's
`cardBlockParser.ts` matches its own `<card>`/`</card>` nesting syntax via
`/<card\b[^>]*>|<\/card>/`, and `\b` triggers on a hyphen, so `<card-embed>` would
collide with that parser. `wattle-embed` has zero collision risk. Block-level (not an
inline chip) because that's what `CardEmbed.tsx` already rendered — a `.card-shell
.card-embed` box with its own header/fold chrome — so this formalizes the existing
visual, it isn't a UX change.

Two extension lists share this one node definition, never diverging:
`richText/extensions.ts` (`baseRichTextExtensions = [StarterKit, CardEmbedNode]`) is
schema-only, safe to use headlessly on the server (`annotationService.ts`, the
migration script). `packages/web/src/components/Card/richtext/extensions.ts` extends
the *same* `CardEmbedNode` with a NodeView
(`CardEmbedNode.extend({ addNodeView: () => ReactNodeViewRenderer(CardEmbedNodeView) })`)
so it renders as a live nested `CardEmbed` in the browser. Keeping the schema
identical between the two is load-bearing: `richText/plainText.ts`'s plain-text
projection (used for annotation anchoring) has to agree between client and server, or
anchors would silently stop resolving on one side.

### NodeView → the existing `CardEmbed` component, via Context not props

`ReactNodeViewRenderer` mounts as a sibling in the ProseMirror-rendered tree, not a
JSX child of whatever rendered the editor — so `CardEmbed`'s dozen existing callback
props (`selectedEmbedId`, `onRunProcess`, `onCreateManualHighlight`, ...) can't be
threaded down as normal props. `CardEditingContext.tsx` carries that whole field set
instead, provided once per `CardRichText` mount; `CardEmbedNodeView.tsx` reads it via
`useContext` and renders `<CardEmbed cardId={node.attrs.cardId} {...ctx}
onRemoveSelf={() => deleteNode()} />`. Recursion still works the same way it always
did — an embed's own content, when it's being edited, mounts its own `CardRichText`
with a fresh `depth + 1`/`ancestorIds ∪ {cardId}` context, just carried via Context at
each level instead of prop-drilled JSX.

`CardRichTextHandle.insertEmbed(cardId)` replaces the old
`CardContentEditorHandle.insertToken(token)` string-splice:
`editor.chain().focus().insertContent({ type: "cardEmbed", attrs: { cardId } }).run()`.

## 2. Rendering — `CardRichText.tsx` replaces `CardContent.tsx` + `CardContentEditor.tsx`

One TipTap `useEditor()` instance now, `editable` toggled live via
`editor.setEditable()` rather than swapping between two structurally different
component trees (plain `AnnotatedText` spans vs. a run of textareas) for read vs. edit
mode. This is what makes annotation decorations trivially consistent either way — it's
the same ProseMirror view underneath regardless of `editable`.

- `content`/`onChangeContent` are controlled only against genuinely *external* changes
  (another tab editing the same Card via the shared `cardStore`) — never against this
  editor's own keystrokes, via a `lastEmittedContent` ref set synchronously in
  `onUpdate` before the prop update it causes ever reaches the sync effect. Without
  this the cursor would jump to the start on every character typed.
- **Annotation overlays are a ProseMirror decoration plugin now**
  (`AnnotationDecorations.ts`), not React-rendered spans. `CardRichText.tsx` feeds the
  live `annotations` prop in via `editor.view.dispatch(editor.state.tr.setMeta(
  annotationDecorationsKey, editable ? [] : annotations))` — the standard "external
  data into a stateful ProseMirror plugin" pattern, since plugin state can only change
  in response to a transaction. Sends `[]` while editing, same as the old
  `AnnotatedText`/`SelectionMenu` split: nothing to annotate mid-edit.
- **Click handling for decorations is event-delegated**, not per-element `onClick` —
  decorations render plain DOM, not JSX, so there's no React handler to attach
  per-span. One `container.addEventListener("click", ...)` in `CardRichText.tsx` does
  `e.target.closest('[data-annotation-id]')`, which naturally resolves a click on
  diff-inside-highlight text to the diff (the innermost decorated element) —
  reproducing the old nested-DOM stopPropagation priority for free.
- `DiffPopover`/`AnnotationDetail` render unchanged, portalled to `document.body` at a
  `DOMRect` captured at click time (`popoverStyle`, relocated from the old
  `AnnotatedText.tsx`).

## 3. Annotation anchoring rework (`packages/shared/src/richText/plainText.ts`)

The hard constraint: diff/footnote/highlight anchors are exact plain-text substrings
(`annotationSchema.anchor: z.string()`, unchanged), resolved with `.indexOf`/
`.includes`/`.replace` against the raw content string — incompatible with raw HTML,
where tag boundaries break substring matching and a naive `.replace()` risks
corrupting markup. One shared module, used identically by the client (already has a
live `editor.state.doc`) and the server (`htmlToDoc(storedHtml)`, via `@tiptap/html` +
`happy-dom`), so client and server can never independently drift on how an anchor
resolves:

- **`flattenToPlainText(doc)`** — walks the doc, concatenating text nodes and
  inserting `"\n\n"` (`BLOCK_SEPARATOR`) between adjacent blocks so two paragraphs
  never silently merge into one word. Returns `{ text, charDocPos }`, a flat parallel
  array mapping each plain-text character index to its ProseMirror document position
  — a single array index instead of a binary search, cheap enough at Card scale.
  A `cardEmbed` node (atom, no text children) contributes nothing to the flattened
  text, matching the old behavior where an anchor never spanned into a `[[cardId]]`
  token.
- **`findAnchorRange(doc, anchor)`** — `text.indexOf(anchor)` against the flattened
  projection, mapped back to a `{ from, to }` document position range via
  `charDocPos`. First-occurrence-only, same documented limitation the old
  `text.indexOf`-based resolution always had — not a new regression.
- **`htmlToDoc(html)`** — parses stored HTML through the *same restrictive schema*
  the live editor uses (`getSchema(baseRichTextExtensions)`, cached — every doc this
  module produces must share one `Schema` *instance*, not independently-derived
  structural copies, since a `Transform` combining nodes across schemas breaks).
  Anything the schema doesn't define — a bare `<script>`, an `onclick` attribute, an
  unrecognized tag — is silently dropped during parse, never reaching a DOM. **This is
  what makes storing raw HTML safe without a separate sanitizer**: the schema *is* the
  sanitizer, and content is never rendered via `dangerouslySetInnerHTML` anywhere.
- **`replaceAnchorInHtml(html, anchor, replacement)`** — mutates at the ProseMirror
  document-model level (`new Transform(doc).replaceWith(range.from, range.to, ...)`),
  never a raw string `.replace()` on the HTML — this is what keeps a diff-accept from
  corrupting markup when the anchor sits near a tag boundary. Returns `null` on no
  match, same silent-skip contract every other anchor mismatch in this app already has.
- **`findEmbeddedCardIds(doc)`** (in the same file) — walks the doc for `cardEmbed`
  nodes, the rich-text replacement for regexing `[[cardId]]` tokens out of plain text.
- **`flattenAnnotationLayout`** (`richText/annotationLayout.ts`) — the pre-existing
  overlap-flattening sweep-line algorithm relocated out of the deleted
  `resolveAnnotationSpans.ts` unchanged in substance (pure interval math, coordinate-
  space-agnostic): reduces several diff/highlight annotations that genuinely coincide
  on the same span down to "pick one of each type," same "the rendering must support
  this" requirement the annotation feature always had. Its output now feeds
  `Decoration.inline`/`Decoration.widget` calls instead of React span objects.

### `annotationService.ts` call-site changes

- `resolveScopeCards`: content is flattened via `flattenToPlainText(htmlToDoc(html))`
  before being shown to a diff/footnote/highlight model call or checked against a
  manual highlight — the model only ever sees plain text, never raw HTML tags. Child
  Card discovery switched from regexing `[[cardId]]` to `findEmbeddedCardIds`.
- `createManualHighlight`: `.includes()` → `findAnchorRange(...) !== null`.
- `acceptDiff`/`acceptAllDiffs`: `.replace()`/`.indexOf()` on raw HTML →
  `replaceAnchorInHtml(...)`; `acceptAllDiffs`'s back-to-front ordering sort uses
  `findAnchorRange(...).from` instead of a raw `indexOf`.
- **`SelectionMenu.tsx`**: previously anchored on `window.getSelection().toString()`
  directly — broken under the new model, since a raw DOM selection spanning two
  paragraphs has no separator while `flattenToPlainText` inserts one, so a
  cross-paragraph highlight would never match server-side. Now maps the native
  `Selection`/`Range` into ProseMirror positions via `editor.view.posAtDOM(node,
  offset)` (needed because the editor is non-editable when `SelectionMenu` shows, so
  there's no live ProseMirror selection to read directly), then derives the anchor
  from `flattenToPlainText(editor.state.doc).text`, sliced via a new
  `plainTextIndexForDocPos(charDocPos, docPos)` helper — the reverse of
  `charDocPos`'s forward (index → position) mapping, via linear scan rather than
  binary search since `charDocPos` is only non-decreasing (block separators share a
  position), not strictly increasing. This keeps the anchor byte-identical to what
  `findAnchorRange` will later look up server-side.

## 4. Data migration (`packages/api/scripts/migrateContentToHtml.ts`)

One-time, manual script (`npx tsx packages/api/scripts/migrateContentToHtml.ts
[--dry-run]`) — not wired into any npm script or app startup. Converts every
`"note"`-typed `Card.content` and non-null `PageCard.draftContent` from the old
plain-text-with-`[[cardId]]`-tokens format to HTML, reusing `parseCardRefs` (promoted
from `packages/web/src/lib/` into `@wattle/shared/richText/` in this same stage, since
this script would otherwise have been a third independent copy of that text/ref
split). A plain-text segment becomes `<p>` blocks split on blank lines (matching
`flattenToPlainText`'s `BLOCK_SEPARATOR` on the way back out, so a round-trip doesn't
reflow anything), with a lone `\n` becoming `<br>` to mirror the old textarea's
soft-wrap. A ref segment becomes `<wattle-embed data-card-id="...">`. Idempotent — a
row that already looks like HTML (`HTML_TAG_PATTERN` heuristic) is left alone, so a
second run against the same DB is a no-op. Each row is validated (`htmlToDoc`) and
written independently, not inside one large transaction, so a crash partway through
leaves whatever already succeeded converted rather than rolling everything back.

## 5. Dock WYSIWYG formatting toolbar (`Dock.tsx`)

`Dock.tsx` had zero visibility into *editing* state before this (only *selection*),
and no way to reach an actively-editing TipTap instance — the Dock is a tree sibling
of wherever a Card's editor actually lives, not an ancestor.

- **`activeEditorRegistry.ts`** (new) — a module-level external store
  (`useSyncExternalStore`), not React context, because there's no ancestor/descendant
  relationship to thread through: `CardRichText.tsx` calls `setActiveEditor(editor)`
  on focus; `useActiveEditor()` in `Dock.tsx` reads it reactively.
- **`isEditingActive: boolean`** (`App.tsx`, derived from the existing
  `editingPageCardIds`/`editingEmbedIds` sets — no new state) swaps the Dock's entire
  action row for the formatting row, same "collapse to just what's relevant"
  convention Move Mode's own Cancel-only row already uses. Formatting wins over plain
  selection in the row's priority ternary; Move states still take priority over that.
- **Reactive active-state** (e.g. the Bold button showing pressed while the cursor
  sits in bold text) via `@tiptap/react`'s `useEditorState`, which supports
  subscribing to an externally-owned `Editor` instance — `editor?.isActive("bold")`
  etc., recomputed on every relevant editor transaction.
- **`DockAction.active?: boolean`** (new optional field) renders via
  `className={action.active ? "button--pressed" : undefined}` — `Button.tsx` already
  spreads `...rest` including `className`, so no changes needed there. New
  `.button--pressed` class in `Button.css`.
- **Formatting buttons need `onMouseDown={(e) => e.preventDefault()}`**, scoped to
  `action.key.startsWith("format")` specifically (not applied to every Dock button) —
  without it, the click blurs the ProseMirror `contentEditable` and collapses the
  text selection before the `toggleBold()`/etc. command runs.
- **New icons** (`Icon.tsx`): `bold`, `italic`, `heading`, `bulletList`,
  `orderedList`.

### Follow-up: hiding formatting while the title field has focus, and a back-caret to exit

Made immediately after the stages above landed, in response to two concrete usability
gaps found once the toolbar was live:

1. **The formatting row was showing even when a Card's *title* field (a plain
   `<input>`, not part of the TipTap document) had focus** — `isEditingActive` only
   tracks "editing is open somewhere on this Card," not "the rich-text body
   specifically has focus," and `activeEditorRegistry`'s `activeEditor` is
   deliberately never cleared on blur (a Dock button click blurs the editor before its
   own `onClick` fires, and the toolbar still needs that same instance as its target
   a moment later). Fixed by adding a second, genuinely focus-tracking flag to the
   registry: `setActiveEditorFocused(focused)` / `useActiveEditorFocused()`, flipped
   by new `onFocus`/`onBlur` callbacks on the TipTap `useEditor()` call in
   `CardRichText.tsx`. `Dock.tsx` now only renders the five formatting buttons
   (`formatToolActions`) while `activeEditorFocused` is true; unaffected while the
   title field, not the body, has focus.
2. **No way to exit editing directly from the formatting row** — previously the only
   way out was the existing tap-outside-to-close gesture, which doesn't help once the
   row's own formatting buttons are hidden per the fix above (nothing left to look at
   but a Card you may not want to tap on). Added a `backFormatting` action, always the
   first button in the row regardless of focus state, wired to a new `App.tsx`
   `exitEditing()` that mirrors whichever surface is actually editing: a top-level
   Page Card or an independently-selected embed fully deselects (`exitEditPageCard`/
   `handleDeselectEmbed`, matching what tap-outside already does for them); a Dock
   Card just drops out of edit mode and stays selected (`toggleEditEmbed`, matching
   `CardEmbed.tsx`'s own click-outside effect for it).

## 6. Generation prompt updates

- **`prompts/generate/system.md` rule 6** rewritten from "plain text, no markdown, no
  HTML" to an explicit allowlist: `<p>`, `<strong>`, `<em>`, `<h1>`–`<h3>`, `<ul>`,
  `<ol>`, `<li>` (plus `<card>` itself, per rule 2) — no other tag, no attributes, and
  no markdown syntax as an alternative to the tags (spelled out explicitly:
  `**bold**`, `#` headings, `-`/`*`/`1.` list markers, code fences, `[link](url)` are
  all called out as disallowed). The example output block was updated to match.
- **`prompts/selection/system.md` / `prompts/interactive/system.md`** — both extended
  with a one-sentence restatement of the same tag allowlist. These files' own text
  claims to be "identical to the main generation prompt," but `promptCompiler.ts`'s
  `loadSystemPrompt(mode)` reads exactly one file per mode with **no concatenation** —
  so that claim was never actually true for rule 6's content specifically, a latent
  gap predating this work. Fixed directly (in-scope enough since `interactive` mode is
  genuinely live-wired via the Feed Input Button's override-instruction path) rather
  than left broken or silently deferred.
- **`prompts/{diff,footnote,highlight}/system.md`** — no wording changes needed: after
  the `annotationService.ts` rework above, these models are always shown plain text
  (never raw HTML), so "anchor must be verbatim from the content shown to you" already
  holds unmodified.
- **`generationService.ts`'s `materializeParts`** — splices `<wattle-embed
  data-card-id="${child.id}"></wattle-embed>` instead of `[[${child.id}]]`, required
  alongside the editor rewrite (not deferrable) or generated content would leave dead
  bracket tokens sitting inertly in HTML.
- **`cardBlockParser.ts`** — confirmed unaffected: its `TAG_REGEX` only matches
  literal `<card\b...>`/`</card>`, not a generic tag matcher, so other HTML tags in a
  model's streamed output pass through as opaque text.

### `GhostCard.tsx`: live tag parsing during streaming

The approved plan's own residual-risk note assumed a partial tag might flash as raw
characters for a moment mid-stream, self-healing once the real Card takes over — an
underestimate: since `GhostCard.tsx` rendered `part.text` as literal escaped JSX text
with **no** HTML parsing at all, the *entire* tag-laden content (not just a
transient partial tag) would stay visible as raw markup for the whole streaming
duration once formatting tags were allowed by rule 6. Surfaced to the user via
`AskUserQuestion` rather than silently accepted or silently fixed; the user chose the
most involved of three options — parse tags live in the preview, matching the final
saved Card exactly.

Implemented without `dangerouslySetInnerHTML`: `renderGhostFragment(html, keyPrefix)`
uses the browser's own lenient `DOMParser().parseFromString(html, "text/html")` (which
degrades gracefully on an incomplete/still-streaming tag — an unclosed tag at the very
end of the text streamed so far just parses as still-open) and then manually walks the
resulting DOM tree (`ghostDomChildrenToReact`), converting only an explicit allowlist
of tags (`GHOST_ALLOWED_TAGS` — the exact rule-6 set) to real React elements via
`createElement(tag, { key }, ...children)`; anything else is unwrapped to a `Fragment`
(text survives, the tag itself doesn't). Same "unknown markup is inert, never real
DOM" guarantee `htmlToDoc`'s schema-based parsing gives the saved Card, just
implemented directly here since a streaming ghost card has no live TipTap instance.
`CardContent.css`'s `.card-content__text` block gained matching typography (duplicated
from `CardRichText.css`'s `.ProseMirror` rules by hand, not cross-referenced, since a
ghost card renders through this lightweight allowlist walk instead of a real editor).

### Follow-up: the ghost card wasn't visibly streaming

Reported as "generated content waits until it's finished instead of streaming with a
typing effect." Traced end-to-end before changing anything: `anthropicProvider.ts`/
`openRouterProvider.ts` both genuinely stream token deltas, `CardBlockParser` forwards
them as SSE events per chunk, and `useGeneration.ts`'s `nodes` state updates on every
one — confirmed for real (not just by reading the code) with a raw `curl -N` against
the SSE endpoint, both directly against the API and through the Vite dev proxy, timing
each event: text arrives in real, human-paced increments over several seconds, not in
one final burst. A headless-browser run of the actual app (Playwright,
`chromium.launch()`, no project driver existed for this app yet) confirmed the DOM
text genuinely does grow incrementally too.

**The actual bug**: nothing ever scrolled the page's one scrollable container
(`styles/global.css`'s `.app__main`, `overflow-y: auto`) to follow the ghost card as
it grew taller. Confirmed by reading `getBoundingClientRect()` on the ghost card
across the same browser run — its `top` stayed fixed while `bottom` kept extending
past the viewport edge as content streamed in, meaning most of the "typing" was
happening invisibly below the fold, which reads exactly like "nothing happens until
it's done." Fixed in `GhostCard.tsx`: a "stick to bottom" autoscroll, the same
convention a chat log uses — a `useEffect` scroll listener on `.app__main` tracks
whether the reader was already near the bottom (`STICK_TO_BOTTOM_THRESHOLD = 96px`)
the last time they touched scroll position, and a `useLayoutEffect` (no dependency
array — runs after every render, including a nested ghost card opening/closing) calls
`viewport.scrollTo({ top: viewport.scrollHeight })` only while that "sticking" flag is
still true, so it keeps following the growing card without hijacking the scroll
position of a reader who's deliberately scrolled away to read something else
mid-generation. Re-verified with the same `getBoundingClientRect()` browser check
after the fix: `bottom` now stays pinned near the viewport edge and `top` moves up as
the card grows, confirmed visually with a screenshot too.

## Files touched

**`packages/shared`**: `src/richText/` (new — `cardEmbedNode.ts`, `extensions.ts`,
`plainText.ts`, `annotationLayout.ts`, `parseCardRefs.ts` relocated from
`packages/web/src/lib/`), `src/index.ts`, `src/types.ts`, `package.json` (new
dependencies).

**`packages/api`**: `scripts/migrateContentToHtml.ts` (new), `src/services/
annotationService.ts` (anchor resolution rework), `src/services/generationService.ts`
(`materializeParts` embed tag), `package.json` (`happy-dom`).

**`packages/web`**: `src/components/Card/richtext/` (new — `CardRichText.tsx`,
`CardRichText.css`, `CardEditingContext.tsx`, `CardEmbedNodeView.tsx`,
`AnnotationDecorations.ts`, `extensions.ts`), `src/lib/activeEditorRegistry.ts` (new),
`src/components/Card/Card.tsx` / `CardEmbed.tsx` (use `CardRichText`, thread
`annotations`), `src/components/Card/SelectionMenu.tsx` (ProseMirror-position-based
anchoring), `src/components/Card/GhostCard.tsx` (live tag rendering, streaming
autoscroll), `src/components/Card/CardContent.css` (ghost-card typography),
`src/components/Dock/Dock.tsx` / `.css` (formatting row, title-field gating,
back-caret), `src/components/primitives/Icon.tsx` / `Button.css` (formatting icons,
`.button--pressed`), `src/App.tsx` (`isEditingActive`, `exitEditing`), `src/i18n/
en.json` (`dock.action.{bold,italic,heading,bulletList,orderedList,back}`).
**Deleted**: `src/components/Card/AnnotatedText.tsx`, `src/components/Card/
CardContent.tsx`, `src/components/Card/CardContentEditor.tsx` / `.css`, `src/lib/
resolveAnnotationSpans.ts`, `src/lib/parseCardRefs.ts` (relocated, not just deleted).

**`packages/prompt-engine`**: `prompts/generate/system.md`, `prompts/selection/
system.md`, `prompts/interactive/system.md`.

## Known limitations / deliberate scope cuts

- A diff-accept replacement takes a uniform mark state if its anchor spans a mark
  boundary (ProseMirror's default `insertText`/`replaceWith` behavior) — rare given
  prompts already steer anchors toward short phrases, not fixed with a per-character
  mark-preserving implementation.
- First-occurrence-only anchor matching — unchanged from the pre-rich-text behavior,
  not a new regression.
- `happy-dom` is a real, fairly heavy new server dependency — it's the only
  officially-supported path for `@tiptap/html`'s Node bundle.
- "Active editor" is last-focus-wins, not rigorously "the one currently selected" —
  acceptable given at most one editor is plausibly mid-interaction with the Dock at a
  time already, under the existing click-outside-closes-editing convention.
- `cardEmbed` stays block-level, never an inline mid-sentence chip — matches actual
  pre-existing behavior; an inline reference would be a separate, larger feature.
- No in-browser interactive/visual testing was done for the five originally-planned
  stages beyond `tsc --noEmit` + dev-server-boot + a live functional annotation
  round-trip via `curl` — the two follow-up fixes (title-field gating/back-caret,
  streaming autoscroll) *were* additionally verified with a real headless-browser
  Playwright run against the running app, screenshots included.

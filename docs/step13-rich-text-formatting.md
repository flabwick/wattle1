# Step 13 — Expanded Rich Text Formatting

Step 10 gave Cards a real TipTap/ProseMirror editor but a narrow schema (StarterKit
defaults plus `cardEmbed`/`actionButton`/`actionField`). This step closes most of the
gap against what a note-taking app's WYSIWYG editor is expected to support, landed in
three phases against an explicit priority ordering agreed with the user up front
(gap analysis: what Obsidian-flavored Markdown can express that TipTap notes
couldn't).

## Phase 1 — marks and blocks TipTap v3's StarterKit already ships

The schema surprise that shaped this whole step: `@tiptap/starter-kit@3.x` already
bundles `Strike`, `Underline`, and `Link` by default (v2's StarterKit didn't) — so
most of "Phase 1" turned out to be *exposing* existing schema support in the Dock
toolbar, not adding it.

- **`packages/shared/src/richText/extensions.ts`** — `richTextStarterKit =
  StarterKit.configure({ codeBlock: false })` (StarterKit's plain `codeBlock` can't
  take a `lowlight` instance, so it's disabled in favor of a replacement below).
  New `codeBlockExtension = CodeBlockLowlight.configure({ lowlight:
  createLowlight(common) })` — highlight.js's "common" ~40-language subset, one
  shared `lowlight` instance so a language detected client-side matches server-side.
  Both client (`packages/web/src/components/Card/richtext/extensions.ts`) and
  server (`baseRichTextExtensions`) include the same `codeBlockExtension`; the web
  side further `.extend()`s it with a NodeView (`CodeBlockNodeView.tsx`, see Phase 3).
- **`Dock.tsx`'s `formatToolActions`** — new buttons: Strikethrough, Underline,
  Blockquote, Code block, Horizontal rule, and an external Link (opens
  `LinkUrlPicker.tsx`, a small anchored popover — same pattern as the pre-existing
  "insert card link" popover, but sets a plain `<a href>` mark via
  `setLink`/`unsetLink` rather than a `cardEmbed`). Heading's button no longer
  toggles a fixed H2 — it now **cycles paragraph → H1 → H2 → … → H6 → paragraph**
  on repeated clicks, since StarterKit's `Heading` extension already supports all
  six levels (input rules for `# ` through `###### ` already worked; only the
  toolbar was capped at one level).
- **New icons** (`Icon.tsx`): `strikethrough`, `underline`, `blockquote`,
  `horizontalRule`, `codeBlock`, `externalLink`.
- **`CardRichText.css`** — styling for `hr`, `a`, inline `code`, and `pre`/`code`
  blocks (the latter using the app's existing "retro terminal" token palette,
  plus new `--color-terminal-text-green/-cream/-muted` tokens mapped onto
  highlight.js's `.hljs-*` token classes rather than pulling in a separate
  highlight.js theme stylesheet that wouldn't match the app's light/dark palette).
- **Deliberately untouched**: the generation prompt's tag allowlist (Step 10's
  `<p>/<strong>/<em>/<h1-h3>/<ul>/<ol>/<li>`) — the model still only ever produces
  that narrow set; these new marks are manual-editing-only for now.

## Phase 2/3 — new node types

### Tables, task lists, images

- **`@tiptap/extension-table`**'s `TableKit` (`resizable: false` — no drag-handle
  chrome/CSS needed), **`@tiptap/extension-list`**'s `TaskList`/`TaskItem`
  (`nested: true`), and **`@tiptap/extension-image`** (`allowBase64` left at its
  default so pasting a clipboard image without a URL still works) — all added to
  `baseRichTextExtensions`, no NodeViews needed (checkbox toggling and table cell
  editing are self-contained in the official extensions' own DOM handling).
- **Toolbar**: "Insert table" (fixed 3×3 with header row — no per-cell add/remove
  row/column buttons; Tab-in-last-cell still adds rows natively via ProseMirror's
  own table keymap), "Task list" toggle, "Insert image" (see below).
- **Inline images and file upload — a new, deliberately separate upload path**:
  `POST/GET /api/rich-text-images` (`packages/api/src/routes/richTextImages.ts`)
  stores bytes and returns a plain URL *without* creating a Card — reuses the same
  multer config/uploads dir "file" Cards use, but an inline image shouldn't also
  show up as a sibling Card on the Page. `GET` guards against path traversal via
  `path.basename` on the filename param (content-type is inferred from the file
  extension by `res.sendFile`, not stored separately).

### Callouts (`packages/shared/src/richText/calloutNode.ts`)

No official TipTap extension exists for Obsidian-style `> [!note]` callouts, so
this is a custom node: `group: "block", content: "block+"`, attrs `kind` (one of
`note/tip/important/warning/danger`) and `collapsed`, round-tripping through a
`<wattle-callout data-kind="..." data-collapsed="...">` tag. The fold-toggle
button and per-kind label/icon are **NodeView-only chrome** (`CalloutNodeView.tsx`)
— not stored in the document — same "extra rendering, not extra content" split
`CardEmbedNode`'s header uses. `NodeViewContent` stays mounted even while
collapsed (hidden via CSS only), since ProseMirror expects its contentDOM to
always exist. Per-kind coloring reuses existing accent-role tokens rather than a
new palette. Inserted via a small kind-picker popover (`CalloutKindPicker.tsx`,
same shape as the pre-existing `ActionFieldKindPicker.tsx`).

### Math (`packages/shared/src/richText/mathNode.ts`)

Two atom nodes, `mathInline` (`$…$`) and `mathBlock` (`$$…$$`), each just an
attribute (`latex: string`) — atoms because KaTeX needs the whole source string
at once, not a stream of ProseMirror text nodes. Both round-trip through
`<wattle-math-inline>`/`<wattle-math-block>` tags and have `addInputRules()` so
typing the closing delimiter auto-converts in place (mirroring Obsidian's own
typing shortcut). One shared NodeView (`MathNodeView.tsx`, client-only — KaTeX's
~250KB bundle has no reason to load server-side) renders via
`katex.renderToString`; clicking the rendered output swaps in a plain text input
to edit the raw LaTeX (Enter/blur commits, Escape discards). A freshly-inserted
node (empty `latex`) starts directly in editing mode.

### Mermaid diagrams

No new node type — layered onto the existing `codeBlock` node instead:
`CodeBlockNodeView.tsx` renders the normal `<pre><code>` (via `NodeViewContent`,
so lowlight's syntax-highlighting decoration plugin still applies exactly as if
there were no custom NodeView) for every language, and *additionally* renders a
live diagram preview below the source when `language === "mermaid"`. Mermaid
itself is **dynamically imported** (`await import("mermaid")`, memoized) rather
than a top-level import — the library pulls in every diagram-type sub-bundle and
added 600KB+ to the production bundle when imported eagerly; lazy-loading it
dropped the main JS bundle from ~2MB to ~1.4MB (gzipped: 574KB → 421KB) since most
Cards never contain a mermaid fence.

## Deliberately out of scope (flagged, not silently dropped)

- **`==highlight==` as inline body syntax** — would create two different,
  visually-similar ways to "highlight" the same selected text: this new mark vs.
  the pre-existing annotation-overlay highlight system (`metadata.annotations`,
  anchored to plain text, with its own accept/remove UI). Surfaced as a product
  decision rather than picked silently; not built either way yet.
- Path/title-based wikilinks, block references/IDs, frontmatter-as-freeform-YAML,
  a first-class tag model, and backlinks — all vault/graph-architecture features,
  not rich-text-editor formatting; explicitly scoped out of this pass.
- Table row/column add/delete buttons (insert-only for now).
- The generation prompt's allowlist was not widened to cover any of Phase 1-3's
  new marks/nodes — the model still only ever produces Step 10's original tag set.

## Files touched

**`packages/shared`**: `src/richText/extensions.ts` (codeBlockExtension,
taskListExtension/taskItemExtension, tableExtension, imageExtension,
`CalloutNode`, `MathInlineNode`/`MathBlockNode` all added to
`baseRichTextExtensions`), `src/richText/calloutNode.ts` (new),
`src/richText/mathNode.ts` (new), `src/index.ts` (exports), `package.json`
(`@tiptap/extension-code-block-lowlight`, `@tiptap/extension-image`,
`@tiptap/extension-list`, `@tiptap/extension-table`, `highlight.js`, `lowlight`).

**`packages/api`**: `src/routes/richTextImages.ts` (new), `src/app.ts` (mounts it).

**`packages/web`**: `src/components/Card/richtext/extensions.ts` (NodeView wiring
for callout/math/codeBlock), `CalloutNodeView.tsx`/`CalloutNode.css`/
`CalloutKindPicker.tsx` (new), `MathNodeView.tsx`/`MathNode.css` (new),
`CodeBlockNodeView.tsx` (new), `LinkUrlPicker.tsx` (new), `CardRichText.css`
(tables/task-lists/images/code-block/hljs-token/blockquote/hr/link styling),
`components/Dock/Dock.tsx` (every new formatting/insert action + popover state),
`components/primitives/Icon.tsx` (new icons), `api/client.ts`
(`uploadRichTextImage`), `package.json` (`katex`, `mermaid`), `i18n/en.json`.

## Verified

`tsc --noEmit` and `vite build`/`tsc` build clean across all three packages after
every addition. Hit one real dependency-resolution issue mid-build: pinning new
`@tiptap/extension-*` packages at a caret range let npm resolve a slightly newer
`@tiptap/core` for them than the rest of the app had, which npm then nested as a
**second physical copy** per workspace instead of hoisting to one root copy —
TypeScript treats two physically separate installs of even the *same* version as
structurally distinct types (private class fields), which broke cross-package
typing between `@wattle/shared`'s extensions and `packages/web`'s own `Extensions`
type. Fixed by pinning every `@tiptap/*` dependency to the exact same version
(no caret) across `packages/shared`/`packages/web` and doing a full clean
reinstall, which restored single-copy hoisting. Not verified in a running
browser — no in-app screenshot/click-through pass was done for any of Phase 1-3.

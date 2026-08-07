import StarterKit from "@tiptap/starter-kit";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import type { Extensions } from "@tiptap/core";
import { CardEmbedNode } from "./cardEmbedNode.js";
import { PageLinkNode } from "./pageLinkNode.js";
import { ActionButtonNode } from "./actionButtonNode.js";
import { ActionFieldNode } from "./actionFieldNode.js";
import { CalloutNode } from "./calloutNode.js";
import { MathBlockNode, MathInlineNode } from "./mathNode.js";

/** The formatting extension set — one shared config so the client's live editor and
 *  the server's headless parsing (plainText.ts's htmlToDoc) always agree on what a
 *  document can contain. Anything the web app needs beyond this (a NodeView for
 *  cardEmbed) extends *this* set rather than reconfiguring StarterKit separately —
 *  see packages/web/src/components/Card/richtext/extensions.ts. `codeBlock` is
 *  disabled here in favor of codeBlockExtension below, which needs its own lowlight
 *  instance — StarterKit's own `codeBlock` option can't take one. Bold/italic/
 *  strike/underline/link/blockquote/horizontalRule/headings (all levels)/lists all
 *  ship as StarterKit v3 defaults already; nothing to configure for those. */
export const richTextStarterKit = StarterKit.configure({ codeBlock: false });

/** highlight.js's "common" language subset (~40 languages) — covers everything a
 *  Card is realistically going to have pasted into it without bundling every
 *  grammar highlight.js ships. One instance, shared by client and server, so a
 *  language detected/highlighted one place matches the other. */
const lowlight = createLowlight(common);

/** Swaps in for StarterKit's plain `codeBlock` (disabled above) — same node name
 *  ("codeBlock") and HTML shape (`<pre><code class="language-xxx">…`), just with
 *  lowlight's decorations layered on top for syntax highlighting when it's part of
 *  a live EditorView — a no-op for the server's headless generateHTML/generateJSON
 *  calls below, which only need the schema, not the decoration plugin. */
export const codeBlockExtension = CodeBlockLowlight.configure({ lowlight });

/** GFM-style task list (`- [ ] …` / `- [x] …`) — `nested: true` lets a task item
 *  contain its own sub-list, same as a plain bulletList/orderedList item already
 *  can. The checkbox toggle is entirely self-contained in TaskItem's own internal
 *  DOM node view (no Wattle-side NodeView needed, unlike calloutExtension below). */
export const taskListExtension = TaskList;
export const taskItemExtension = TaskItem.configure({ nested: true });

/** GFM-style table — resizable stays off (the default) to skip the drag-handle
 *  chrome/CSS a resizable table needs; TableKit registers Table/TableRow/
 *  TableHeader/TableCell together, same "one bundle" convenience StarterKit itself
 *  is. */
export const tableExtension = TableKit.configure({ table: { resizable: false } });

/** A single `<img>` node — `allowBase64` left at its default (on) so pasting an
 *  image copied from elsewhere (no URL, just clipboard bitmap data) still works;
 *  Wattle has no separate "upload this pasted image and swap in a real URL" pass,
 *  so restricting this would make that paste silently fail instead. */
export const imageExtension = Image;

/** Schema-only extension list (no React NodeView on cardEmbed/actionButton/
 *  actionField/callout/mathInline/mathBlock) — safe to use headlessly on the
 *  server (annotationService.ts, the data migration script). */
export const baseRichTextExtensions: Extensions = [
  richTextStarterKit,
  codeBlockExtension,
  taskListExtension,
  taskItemExtension,
  tableExtension,
  imageExtension,
  CalloutNode,
  MathInlineNode,
  MathBlockNode,
  CardEmbedNode,
  PageLinkNode,
  ActionButtonNode,
  ActionFieldNode,
];

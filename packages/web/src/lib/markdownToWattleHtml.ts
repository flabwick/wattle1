import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { defaultHandlers } from "mdast-util-to-hast";
import type { Handler, Handlers } from "mdast-util-to-hast";
import { visit } from "unist-util-visit";
import { findAndReplace } from "mdast-util-find-and-replace";
import type { Root, Blockquote, Paragraph, Text, Image, List, ListItem } from "mdast";
import type { Element } from "hast";
import { htmlToDoc, CALLOUT_KINDS } from "@wattle/shared";
import type { CalloutKind } from "@wattle/shared";

/** Obsidian ships many more callout types than Wattle's fixed five (calloutNode.ts's
 *  own doc comment: "the closest Wattle can get without inventing a whole
 *  admonition-syntax parser") — this folds every Obsidian kind Wattle doesn't have a
 *  direct match for onto its nearest neighbor rather than defaulting everything
 *  unmatched to "note", which would flatten genuinely different severities (a
 *  "danger"/"bug" callout reading identically to a plain "note" would lose real
 *  meaning the source author intended). */
const OBSIDIAN_CALLOUT_KIND_MAP: Record<string, CalloutKind> = {
  note: "note",
  abstract: "note",
  summary: "note",
  tldr: "note",
  info: "note",
  todo: "note",
  tip: "tip",
  hint: "tip",
  important: "important",
  success: "warning",
  check: "warning",
  done: "warning",
  question: "warning",
  help: "warning",
  faq: "warning",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  failure: "danger",
  fail: "danger",
  missing: "danger",
  danger: "danger",
  error: "danger",
  bug: "danger",
  example: "note",
  quote: "note",
  cite: "note",
};

function resolveCalloutKind(rawKind: string): CalloutKind {
  const mapped = OBSIDIAN_CALLOUT_KIND_MAP[rawKind.toLowerCase()];
  return mapped && (CALLOUT_KINDS as readonly string[]).includes(mapped) ? mapped : "note";
}

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|svg|webp|bmp)$/i;

function isRemoteOrDataUrl(url: string): boolean {
  return /^(https?:|data:)/i.test(url);
}

/** Obsidian's `[!kind]` / `[!kind]+` / `[!kind]-` callout marker, at the very start
 *  of a blockquote's first line — matched against just the substring up to the first
 *  "\n" (a callout without a blank line after the marker collapses into one
 *  multi-line paragraph text node, so `^...$` alone would never match past that
 *  newline). Group 2 ("+"/"-") is Obsidian's own collapsed/expanded fold suffix. */
const CALLOUT_MARKER_PATTERN = /^\[!([a-zA-Z]+)\]([+-])?\s?/;

/** Obsidian-style callouts (`> [!warning] Careful`) have no direct mdast node type —
 *  detected here as a Blockquote whose first paragraph starts with a `[!kind]`
 *  marker, then mapped onto Wattle's own `wattle-callout` node via mdast-util-to-
 *  hast's `data.hName`/`data.hProperties` override (see its `applyData`): the
 *  blockquote's normal children transform runs unchanged, only its tag name/
 *  attributes are swapped afterward — no custom handler needed, unlike math/task
 *  lists below, which are new node shapes hast has no default rendering for at all.
 *  Any trailing same-line text after the marker (a custom callout title, e.g. "> [!
 *  warning] Careful") is kept as ordinary body content rather than discarded —
 *  Wattle's callout schema (calloutNode.ts) has no separate title attribute. */
function remarkWattleCallouts() {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const firstChild = node.children[0];
      if (!firstChild || firstChild.type !== "paragraph") return;
      const paragraph = firstChild as Paragraph;
      const firstText = paragraph.children[0];
      if (!firstText || firstText.type !== "text") return;
      const text = firstText as Text;
      const firstLine = text.value.split("\n")[0] ?? "";
      const match = CALLOUT_MARKER_PATTERN.exec(firstLine);
      if (!match) return;

      const kind = resolveCalloutKind(match[1]);
      const collapsed = match[2] === "-";
      text.value = text.value.slice(match[0].length);
      // An empty leading text node (marker consumed the whole first line, no title)
      // would otherwise render as a stray blank leading space — drop it.
      if (text.value === "" && paragraph.children.length > 1) {
        paragraph.children.shift();
      }

      node.data = {
        ...node.data,
        hName: "wattle-callout",
        hProperties: { "data-kind": kind, "data-collapsed": collapsed ? "true" : "false" },
      };
    });
  };
}

/** Obsidian syntax with no CommonMark/GFM equivalent at all, so remark-parse never
 *  produces real nodes for it — `[[Note]]`/`[[Note|Alias]]` and `![[...]]` just sit
 *  as literal text. Rewritten here via mdast-util-find-and-replace (not hand-rolled
 *  text splicing, which mishandles matches that aren't the whole node) against Text
 *  nodes only — `ignore` keeps it out of code spans, so a wikilink typed inside
 *  inline code or a fenced block stays literal. Two passes, image-embed first: once
 *  consumed, its leading "!" can never be mistaken for a plain wikilink by the second
 *  pass. Per the product decision this pipeline was built against: a wikilink has no
 *  vault-title search to resolve against, so it becomes plain bold text of its
 *  display name rather than a real (possibly dangling) link; an unresolvable
 *  embedded attachment becomes placeholder text rather than a broken image or a
 *  silently vanished reference. */
function remarkWattleLinksAndAttachments() {
  return (tree: Root) => {
    findAndReplace(
      tree,
      [
        /!\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g,
        (_match: string, target: string) => {
          if (IMAGE_EXTENSION_PATTERN.test(target)) {
            return { type: "text", value: `[Attachment: ${target} — not imported]` } as Text;
          }
          // A non-image embed (`![[Other Note]]`) is Obsidian transclusion — no more
          // resolvable than a plain wikilink, so it gets the same bold-text treatment.
          return { type: "strong", children: [{ type: "text", value: target }] };
        },
      ],
      { ignore: ["code", "inlineCode"] },
    );
    findAndReplace(
      tree,
      [
        /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g,
        (_match: string, target: string, alias: string | undefined) => {
          return { type: "strong", children: [{ type: "text", value: alias ?? target }] };
        },
      ],
      { ignore: ["code", "inlineCode"] },
    );

    // A plain markdown image (`![alt](path)`) whose src isn't fetchable from a
    // browser at all — a relative local path only meaningful inside the author's own
    // Obsidian vault — degrades the same way an unresolvable `![[...]]` embed does,
    // rather than leaving a broken <img> in the compiled Card.
    visit(tree, "image", (node: Image, index, parent) => {
      if (index === undefined || !parent || isRemoteOrDataUrl(node.url)) return;
      const filename = node.url.split("/").pop() || node.url;
      parent.children[index] = { type: "text", value: `[Attachment: ${filename} — not imported]` } as Text;
    });
  };
}

/** GFM task-list items (remark-gfm sets a boolean `checked` on qualifying `listItem`
 *  nodes) render, by mdast-util-to-hast's own default, as a bare `<input>` inside a
 *  `<li class="task-list-item">` — verified directly against
 *  `@tiptap/extension-list`'s TaskItem/TaskList source, this does NOT match what
 *  those extensions' own `parseHTML` requires (`ul[data-type="taskList"]` wrapping
 *  `li[data-type="taskItem"][data-checked]`, itself wrapping a `<label><input
 *  type="checkbox"><span></span></label>` plus a `<div>` for the item's own content)
 *  — TipTap would otherwise drop the unrecognized bare `<input>` entirely and the
 *  checkbox state is lost, degrading to a plain bullet. The two handlers below
 *  produce that exact shape instead, falling back to mdast-util-to-hast's own
 *  default handling for a non-task list/item so ordinary bullet/ordered lists (the
 *  vast majority) are untouched. */

/** Whether every item in a list carries GFM's boolean `checked` — Wattle's TaskList
 *  node only ever contains TaskItem children (checked by direct DOM inspection of
 *  @tiptap/extension-list's TaskList, which parses `ul[data-type="taskList"]`
 *  expecting nothing else inside), so a list mixing a plain bullet alongside `- [ ]`
 *  items can't become a task list at all without producing an invalid node one of
 *  its own children doesn't match — falling back to a plain bulletList for the
 *  whole list (losing checkbox semantics for the mix) is the only structurally
 *  valid option, rather than silently dropping the plain item TipTap's parser would
 *  otherwise reject. */
function isUniformTaskList(node: List): boolean {
  return node.children.length > 0 && node.children.every((child) => typeof child.checked === "boolean");
}

const taskListHandlers: Handlers = {
  list: ((state, mdastNode) => {
    const node = mdastNode as List;
    const result = defaultHandlers.list(state, node);
    if (isUniformTaskList(node) && result && !Array.isArray(result) && result.type === "element") {
      result.properties = { ...result.properties, "data-type": "taskList" };
    }
    return result;
  }) as Handler,
  listItem: ((state, mdastNode, parent) => {
    const node = mdastNode as ListItem;
    const parentList = parent && parent.type === "list" ? (parent as List) : null;
    if (typeof node.checked !== "boolean" || !parentList || !isUniformTaskList(parentList)) {
      return defaultHandlers.listItem(state, node, parent);
    }
    const content: Element = {
      type: "element",
      tagName: "div",
      properties: {},
      children: state.wrap(state.all(node), true),
    };
    const result: Element = {
      type: "element",
      tagName: "li",
      properties: { "data-type": "taskItem", "data-checked": node.checked ? "true" : "false" },
      children: [
        {
          type: "element",
          tagName: "label",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "input",
              properties: node.checked ? { type: "checkbox", checked: true } : { type: "checkbox" },
              children: [],
            },
            { type: "element", tagName: "span", properties: {}, children: [] },
          ],
        },
        content,
      ],
    };
    state.patch(node, result);
    return state.applyData(node, result);
  }) as Handler,
};

/** `$...$`/`$$...$$` (remark-math's `inlineMath`/`math` mdast nodes, a plain string
 *  `value` holding raw LaTeX either way) have no default mdast-util-to-hast
 *  rendering at all — an unknown node type falls back to rendering its `.value` as
 *  literal text, which would leak the raw "$...$" source into the Card. Produces
 *  Wattle's own math nodes directly instead — mathNode.ts's own doc comment says
 *  their input-rule mirrors "Obsidian's own inline-math typing shortcut", so this is
 *  a genuine one-to-one mapping, not an approximation. */
const mathHandlers: Handlers = {
  math: ((_state, node) => ({
    type: "element",
    tagName: "wattle-math-block",
    properties: { "data-latex": node.value },
    children: [],
  })) as Handler,
  inlineMath: ((_state, node) => ({
    type: "element",
    tagName: "wattle-math-inline",
    properties: { "data-latex": node.value },
    children: [],
  })) as Handler,
};

/** Frontmatter's raw YAML body has no dedicated parser here (a single `title:` line
 *  is the only field this pipeline reads) — good enough for the common case without
 *  pulling in a full YAML dependency for one field. */
function extractFrontmatterTitle(raw: string): string | null {
  const match = /^title:\s*(.+)$/m.exec(raw);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, "") || null;
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkMath)
  .use(remarkWattleCallouts)
  .use(remarkWattleLinksAndAttachments)
  .use(remarkRehype, { allowDangerousHtml: true, handlers: { ...taskListHandlers, ...mathHandlers } })
  .use(rehypeStringify, { allowDangerousHtml: true });

export interface MarkdownConversionResult {
  /** Frontmatter's `title:` field, else the document's first H1 (left in place in
   *  `html` either way — see below), else null — not currently wired into Convert's
   *  own output (quickAddRegistry.ts's Add to Page/Add to Dock always create a
   *  blank-titled Card regardless of source), just returned for a future caller that
   *  wants it. */
  title: string | null;
  html: string;
}

/** The full markdown → Wattle rich-text HTML conversion, used by Dock.tsx's Convert
 *  action against a selected markdown File Card's raw text (fetched via
 *  getCardFileUrl, same call FileView.tsx's own read-only preview already makes).
 *  Throws if the produced HTML doesn't parse against Wattle's own schema
 *  (htmlToDoc, @wattle/shared) — the caller is expected to catch this and show a
 *  conversion-failed error rather than trust unvalidated output. */
export function convertMarkdownToWattleHtml(markdown: string): MarkdownConversionResult {
  const tree = processor.parse(markdown) as Root;

  let frontmatterTitle: string | null = null;
  const bodyChildren = tree.children.filter((node) => {
    if (node.type === "yaml") {
      frontmatterTitle = extractFrontmatterTitle(node.value);
      return false;
    }
    return true;
  });

  // Read, not removed: nothing downstream currently consumes `title` (see this
  // function's own return type doc comment) — stripping the heading out of the body
  // to avoid "duplicating" a title that isn't actually rendered anywhere yet would
  // just delete the author's own heading with nothing to show for it.
  let heading1Title: string | null = null;
  const firstNode = bodyChildren[0];
  if (firstNode && firstNode.type === "heading" && firstNode.depth === 1) {
    heading1Title = firstNode.children.map((child) => ("value" in child ? child.value : "")).join("");
  }
  tree.children = bodyChildren;

  const hast = processor.runSync(tree);
  const html = processor.stringify(hast);

  htmlToDoc(html); // throws on anything the schema can't actually parse

  return { title: frontmatterTitle ?? heading1Title, html };
}

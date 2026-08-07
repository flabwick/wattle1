import { getSchema } from "@tiptap/core";
import { generateHTML, generateJSON } from "@tiptap/html";
import { Node as PMNode } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { baseRichTextExtensions } from "./extensions.js";

/** Separates adjacent blocks in the flattened plain-text projection (paragraphs,
 *  list items, headings, ...) — without this, "Hello" followed by a new paragraph
 *  "World" would flatten to "HelloWorld", silently merging words that were never
 *  adjacent in the rendered document. */
export const BLOCK_SEPARATOR = "\n\n";

export interface FlattenedText {
  text: string;
  /** charDocPos[i] is the ProseMirror document position of text[i] — a flat
   *  parallel array, not a sparse breakpoint list. Card-sized content makes this a
   *  non-issue perf-wise, and it keeps offset-to-position lookup a single array
   *  index instead of a binary search. */
  charDocPos: number[];
}

/**
 * The single flattening pass both the client (already has a live `editor.state.doc`)
 * and the server (via `htmlToDoc` below) run against, so an annotation anchor
 * resolves to the exact same plain text and document positions on both sides — see
 * richText/annotationLayout.ts and annotationService.ts, which depend on that
 * agreement. An embed (`cardEmbed`, atom, no text children) contributes nothing to
 * the flattened text, matching the pre-rich-text behavior where an annotation's
 * anchor never spans into a `[[cardId]]` token.
 */
export function flattenToPlainText(doc: PMNode): FlattenedText {
  let text = "";
  const charDocPos: number[] = [];
  let pendingSeparator = false;

  doc.descendants((node, pos) => {
    if (node.isText) {
      const value = node.text ?? "";
      for (let i = 0; i < value.length; i++) {
        text += value[i];
        charDocPos.push(pos + i);
      }
      pendingSeparator = true;
      return true;
    }
    if (node.isBlock && pendingSeparator && text.length > 0) {
      for (const ch of BLOCK_SEPARATOR) {
        text += ch;
        charDocPos.push(pos);
      }
      pendingSeparator = false;
    }
    return true;
  });

  return { text, charDocPos };
}

/** Every `cardEmbed` node's `cardId`, in document order — the rich-text replacement
 *  for regexing `[[cardId]]` tokens out of plain text (annotationService.ts's old
 *  CARD_REF_PATTERN, generationService.ts's materializeParts) now that embeds are a
 *  real node type rather than bracket syntax sitting in the text itself. */
export function findEmbeddedCardIds(doc: PMNode): string[] {
  const cardIds: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === "cardEmbed" && typeof node.attrs.cardId === "string") {
      cardIds.push(node.attrs.cardId);
    }
    return true;
  });
  return cardIds;
}

/** Every `pageLink` node's `pageId`, in document order — richText/pageLinkNode.ts's
 *  counterpart to findEmbeddedCardIds above, used to keep the PageLink table (the
 *  "who links to whom" index Search/orphan-detection query) in sync with what a
 *  Page's Cards actually contain, without re-parsing HTML at query time. */
export function findPageLinkIds(doc: PMNode): string[] {
  const pageIds: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === "pageLink" && typeof node.attrs.pageId === "string") {
      pageIds.push(node.attrs.pageId);
    }
    return true;
  });
  return pageIds;
}

/** Locates `anchor` (an exact substring, same contract as before — see
 *  cardMetadata.ts's annotationSchema doc comment) in `doc`'s plain-text projection,
 *  returning the ProseMirror position range it corresponds to. First-occurrence
 *  only — same documented limitation the old text.indexOf-based resolution had. */
export function findAnchorRange(doc: PMNode, anchor: string): { from: number; to: number } | null {
  if (anchor.length === 0) return null;
  const { text, charDocPos } = flattenToPlainText(doc);
  const idx = text.indexOf(anchor);
  if (idx === -1) return null;
  return { from: charDocPos[idx], to: charDocPos[idx + anchor.length - 1] + 1 };
}

// Built once, not per call — every doc this module produces should share the same
// Schema *instance*, since ProseMirror expects nodes being combined in a single
// Transform (see replaceAnchorInHtml) to come from one schema, not independently
// re-derived-but-structurally-equal copies.
let cachedSchema: ReturnType<typeof getSchema> | null = null;
function getRichTextSchema() {
  if (!cachedSchema) cachedSchema = getSchema(baseRichTextExtensions);
  return cachedSchema;
}

/** Parses a stored HTML string into a ProseMirror document, through the same schema
 *  the live editor uses — anything the schema doesn't define (a bare `<script>`, an
 *  `onclick` attribute, an unrecognized tag) is silently dropped during parse, never
 *  reaching a DOM anywhere; this is what makes storing raw HTML safe without a
 *  separate sanitizer. Works headlessly in Node (via @tiptap/html's server/happy-dom
 *  export) and in the browser (via its DOM export) from the same call. */
export function htmlToDoc(html: string): PMNode {
  const schema = getRichTextSchema();
  const json = generateJSON(html, baseRichTextExtensions);
  return PMNode.fromJSON(schema, json);
}

/** Replaces `anchor` with `replacement` at the ProseMirror document-model level
 *  (a single node-replace, never a raw string `.replace()` on the HTML) — this is
 *  what keeps a diff accept from corrupting markup when the anchor sits near a tag
 *  boundary. Returns null if `anchor` isn't found (same "silently skip" contract
 *  every other anchor mismatch in this app already has). Replacement text takes on
 *  whichever marks are active at `range.from` (ProseMirror's standard behavior for a
 *  plain text node) — accepted: prompts already steer anchors toward short phrases,
 *  so an anchor straddling a mark boundary mid-replacement is a rare edge case, not
 *  worth a per-character mark-preserving implementation. */
export function replaceAnchorInHtml(html: string, anchor: string, replacement: string): string | null {
  const doc = htmlToDoc(html);
  const range = findAnchorRange(doc, anchor);
  if (!range) return null;
  // doc.type.schema, not a fresh getSchema(...) call — ProseMirror expects every
  // node passed into a Transform on `doc` to come from `doc`'s own schema *instance*
  // (two independently-built Schema objects from the same extensions aren't
  // interchangeable), which a second getSchema() call here silently isn't.
  const replacementNode = doc.type.schema.text(replacement);
  const tr = new Transform(doc).replaceWith(range.from, range.to, replacementNode);
  return generateHTML(tr.doc.toJSON(), baseRichTextExtensions);
}

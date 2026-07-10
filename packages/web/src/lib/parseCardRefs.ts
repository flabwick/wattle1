export type ContentSegment =
  | { type: "text"; value: string; start: number; end: number }
  | { type: "ref"; cardId: string; start: number; end: number };

const CARD_REF_PATTERN = /\[\[([a-zA-Z0-9_-]+)\]\]/g;

/** Splits a Card's raw content into plain-text runs and `[[cardId]]` embed references
 *  — see CardLinkPicker.tsx, which is what actually writes this syntax into content,
 *  and CardEmbed.tsx, which renders a "ref" segment as the live referenced Card.
 *  `start`/`end` are each segment's character offsets in the original `content`
 *  string — CardContentEditor.tsx uses these to splice edits back into the whole
 *  string without disturbing sibling segments. */
export function parseCardRefs(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  for (const match of content.matchAll(CARD_REF_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, index), start: lastIndex, end: index });
    }
    const end = index + match[0].length;
    segments.push({ type: "ref", cardId: match[1], start: index, end });
    lastIndex = end;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex), start: lastIndex, end: content.length });
  }
  return segments;
}

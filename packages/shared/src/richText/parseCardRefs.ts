export type ContentSegment =
  | { type: "text"; value: string; start: number; end: number }
  | { type: "ref"; cardId: string; start: number; end: number };

const CARD_REF_PATTERN = /\[\[([a-zA-Z0-9_-]+)\]\]/g;

/** Splits a *pre-rich-text* Card's raw content into plain-text runs and `[[cardId]]`
 *  embed references — the format every Card's `content` was stored in before the
 *  richText migration (packages/api/scripts/migrateContentToHtml.ts), which is the
 *  only remaining caller: it needs this to convert old bracket-token content into
 *  `<wattle-embed>` elements. Not used by the live editor any more (see
 *  richText/cardEmbedNode.ts) — this was previously duplicated between web
 *  (lib/parseCardRefs.ts) and api (annotationService.ts's CARD_REF_PATTERN);
 *  promoted here as the one copy once both needed it for the same migration. */
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

/** One entry as the model returned it — syntactically valid (an object with at least
 *  `cardId`/`anchor` strings) but not yet checked against real Card content, and not
 *  yet validated against the type-specific payload shape (replacement/text/color).
 *  Both of those are the caller's job (annotationService.ts), since only it has the
 *  real content to check an anchor against. */
export interface RawAnnotationEntry {
  cardId: string;
  anchor: string;
  [key: string]: unknown;
}

/** Strips a markdown code fence the model added despite being told not to — the same
 *  defensive tolerance every prompt/parser pairing in this app applies, since models
 *  don't always follow formatting instructions exactly. */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

/**
 * Parses one of the diff/footnote/highlight processes' JSON-array response. Never
 * throws: a response that isn't valid JSON, isn't an array, or is an array of
 * something other than plain objects with string `cardId`/`anchor` fields yields `[]`
 * (or drops just the offending elements) — this is the "if an anchor fails to match,
 * drop the entry silently, no error surfaced" rule applied at the syntactic layer,
 * before the semantic (does this anchor actually appear in the Card) check ever runs.
 */
export function parseAnnotationResponse(raw: string): RawAnnotationEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.filter((entry): entry is RawAnnotationEntry => {
    return (
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).cardId === "string" &&
      typeof (entry as Record<string, unknown>).anchor === "string"
    );
  });
}

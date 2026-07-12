import { z } from "zod";

/**
 * A sparse, anchor-based overlay on a Card's content — never a rewrite of the content
 * itself (see packages/prompt-engine/prompts/{diff,footnote,highlight}/system.md for
 * the output contract that produces these). `anchor` must be an exact substring of the
 * Card's `content` for the entry to be trusted; anything that fails that check is
 * dropped before it ever reaches storage (see annotationService.ts).
 */
const annotationBaseSchema = z.object({
  id: z.string(),
  anchor: z.string(),
  createdAt: z.string(),
});

export const annotationSchema = z.discriminatedUnion("type", [
  annotationBaseSchema.extend({
    type: z.literal("diff"),
    /** Proposed replacement for `anchor`, pending user accept/reject — see
     *  annotationService.ts's acceptDiff/acceptAllDiffs/removeAnnotation. */
    replacement: z.string(),
  }),
  annotationBaseSchema.extend({
    type: z.literal("footnote"),
    /** Plain text only (no links/card references) — user-editable after creation. */
    text: z.string(),
  }),
  annotationBaseSchema.extend({
    type: z.literal("highlight"),
    color: z.string(),
    /** Optional — a highlight need not carry an annotation/comment. */
    text: z.string().optional(),
  }),
]);

export type Annotation = z.infer<typeof annotationSchema>;

/** One accepted diff's pre-change text, kept for a future undo feature (not built yet
 *  — see annotationService.ts's acceptDiff). Append-only, never read back today. */
const diffHistoryEntrySchema = z.object({
  anchor: z.string(),
  original: z.string(),
  replacement: z.string(),
  acceptedAt: z.string(),
});

/**
 * Versioned, extensible per-Card data — the JSON payload stored in Card.metadata
 * (see packages/api/prisma/schema.prisma). Adding a field to what a Card can carry
 * should mean adding it here (or a new version below), not a new DB column.
 */
export const cardMetadataV1Schema = z.object({
  version: z.literal(1),
  /** ids of related Cards. */
  links: z.array(z.string()).default([]),
  summary: z.string().optional(),
  color: z.string().optional(),
  aiParams: z.record(z.unknown()).optional(),
  log: z.array(z.unknown()).default([]),
  /** Which CardTypeDefinition.id this Card is — see lib/getCardTypeId.ts. Omitted
   *  (rather than defaulted here) so getCardTypeId's `?? "note"` stays the one place
   *  that decides what an absent typeId means. */
  typeId: z.string().optional(),
  /** Set only on typeId "file" Cards — where the uploaded file's bytes live on disk
   *  (relative to the API's uploads dir) and its original name/type/size. */
  file: z
    .object({
      storedName: z.string(),
      originalName: z.string(),
      mimeType: z.string(),
      size: z.number(),
    })
    .optional(),
  /** Pending/resolved diff, footnote, and highlight overlays — see annotationSchema
   *  above. Additive and process-agnostic: all three types share this one array. */
  annotations: z.array(annotationSchema).default([]),
  /** Accepted diffs' pre-change text — see diffHistoryEntrySchema above. */
  diffHistory: z.array(diffHistoryEntrySchema).default([]),
});

export type CardMetadataV1 = z.infer<typeof cardMetadataV1Schema>;

export const CURRENT_METADATA_VERSION = 1 as const;

export function defaultMetadata(): CardMetadataV1 {
  return {
    version: CURRENT_METADATA_VERSION,
    links: [],
    log: [],
    annotations: [],
    diffHistory: [],
  };
}

/**
 * Parses raw metadata JSON (from the DB, or from a caller) and upgrades it to the
 * current shape. There's only a v1 today, so anything without a recognized `version`
 * is treated as v1 with defaults filled in for whatever fields are missing. Structured
 * as a version dispatch so a v2 branch (e.g. `if (version === 2) return upgradeV1ToV2(...)`)
 * can be added later without any call site needing to change.
 */
export function migrateMetadata(raw: unknown): CardMetadataV1 {
  const obj: Record<string, unknown> =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const version = obj.version;

  if (version === undefined || version === 1) {
    return cardMetadataV1Schema.parse({ ...obj, version: 1 });
  }

  throw new Error(`Unsupported card metadata version: ${String(version)}`);
}

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
  /** User-editable key/value pairs shown and edited on the Card's info back face
   *  (CardInfoPanel.tsx) — arbitrary facts the user attaches themselves (e.g.
   *  "status: draft"), distinct from every other field here, which the app itself
   *  sets. An array, not a Record, so an in-progress edit (retyping a key) never
   *  silently collides with another entry the way object-key assignment would.
   *  A property's value is either plain text, or (when `linkedCardId` is set) a
   *  reference to another Card — picked via the "@" trigger in CardPropertyRow.tsx,
   *  same CardLinkPicker.tsx search popover the rich-text editor's own card-link
   *  insert uses. `value` still caches that Card's title at link time so the row
   *  has something to show before the live Card loads, but the *live* title (via
   *  useCard) is what's actually displayed once it has. */
  properties: z
    .array(z.object({ key: z.string(), value: z.string(), linkedCardId: z.string().nullable().optional() }))
    .default([]),
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
  /** Set only on typeId "stack" Cards — which of its StackMembers (schema.prisma) is
   *  currently the one "in" the page. Clamped to the member list's bounds wherever
   *  it's read/written (stackService.ts), since a member can be removed out from
   *  under whatever index this was last set to. */
  stack: z
    .object({
      activeIndex: z.number().int().min(0),
    })
    .optional(),
  /** Display-only: excludes this Card from normal Page rendering when set (the Dock's
   *  "reveal hidden cards" toggle shows it inline instead, with a dashed-border design
   *  token to mark it as hidden). Never special-cased in context-assembly logic — a
   *  hidden Card still counts as "everything above the target", exactly like any other
   *  Card (generationService.ts). Settable on any existing Card type, starting with
   *  "note". */
  hidden: z.boolean().optional(),
  /** Pending/resolved diff, footnote, and highlight overlays — see annotationSchema
   *  above. Additive and process-agnostic: all three types share this one array. */
  annotations: z.array(annotationSchema).default([]),
  /** Accepted diffs' pre-change text — see diffHistoryEntrySchema above. */
  diffHistory: z.array(diffHistoryEntrySchema).default([]),
  /** Set only on typeId "action" Cards — a single calibrated job button, the
   *  whole-card counterpart to an inline actionButton node
   *  (richText/actionButtonNode.ts — same jobId/jobParams shape, calibrated
   *  through the same ActionJobFields UI). `jobParams` is a plain object here, not
   *  the JSON-encoded string the TipTap node attr needs — Card.metadata is already
   *  free-form JSON, no ProseMirror attrs-must-be-primitive constraint to work
   *  around. */
  action: z
    .object({
      label: z.string(),
      jobId: z.string().nullable(),
      jobParams: z.record(z.unknown()),
    })
    .optional(),
  /** Set only on typeId "link" Cards — a bookmark to an external URL. The Card's own
   *  `title` is the display title (same convention every other type uses, rather than
   *  registries/definitions/linkCardType.ts's separate, never-enforced `title` field
   *  on its dataSchema); this is just the one field that isn't already covered by an
   *  existing Card column. */
  link: z.object({ url: z.string() }).optional(),
  /** Set only on typeId "prompt" Cards — a flip-card input/output box: `input` is the
   *  live draft prompt text on the front face; each Send appends a new entry to
   *  `iterations` (never overwrites one) rather than replacing a single output, so
   *  past generations stay reachable via `activeIndex` — see PromptCardBody.tsx's
   *  flip/rail UI and usePromptGeneration.ts. `context` controls what the generation
   *  sees: "none" (default, matches the old standalone-only behavior), "page"/"tab"
   *  (every Card on the current Page/Tab, not just the directional Generation Rule
   *  every other generation in the app follows), or "cards" (an explicit list,
   *  `cardIds`). All three new fields default so a pre-existing `{input, output}`
   *  Card (this field's previous shape) still parses — `output` itself is dropped,
   *  superseded by `iterations`. */
  prompt: z
    .object({
      input: z.string(),
      iterations: z
        .array(
          z.object({
            input: z.string(),
            /** HTML — the same restricted rich-text tag set every other generation
             *  in the app produces (see prompts/generate/system.md rule 6), rendered
             *  read-only via CardRichText rather than as escaped plain text. */
            output: z.string(),
            createdAt: z.string(),
          }),
        )
        .default([]),
      /** Which `iterations` entry the back face currently shows — clamped to bounds
       *  wherever it's read/written (PromptCardBody.tsx), same convention as
       *  `stack.activeIndex` above. */
      activeIndex: z.number().int().default(0),
      context: z
        .object({
          mode: z.enum(["page", "tab", "cards", "none"]),
          /** Only meaningful when `mode === "cards"`. */
          cardIds: z.array(z.string()).default([]),
        })
        .default({ mode: "none", cardIds: [] }),
    })
    .optional(),
});

export type CardMetadataV1 = z.infer<typeof cardMetadataV1Schema>;

export const CURRENT_METADATA_VERSION = 1 as const;

export function defaultMetadata(): CardMetadataV1 {
  return {
    version: CURRENT_METADATA_VERSION,
    links: [],
    properties: [],
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

import { z } from "zod";
import { CARD_MATERIAL_IDS } from "../materials.js";

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
 * One step of an "action" Card's job list (registries/definitions/actionCardType.ts) —
 * which entry in the runtime job registry (web/lib/actionJobRegistry.ts) to run and
 * its parameters. `jobId` is a free string, not a Zod-level literal union: the actual
 * set of valid ids is a runtime registry (so new jobs can be added there without a
 * schema change here), validated against at read time by whatever's dispatching it
 * (lib/actionJobs.ts's runActionJob), not by this schema. `jobParams`' shape depends
 * entirely on which job `jobId` names — see each job's own `fields` spec in the
 * registry for what it reads out of this bag.
 */
const actionStepSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  jobParams: z.record(z.unknown()).default({}),
});

export type ActionStep = z.infer<typeof actionStepSchema>;

/**
 * Versioned, extensible per-Card data — the JSON payload stored in Card.metadata
 * (see packages/api/prisma/schema.prisma). Adding a field to what a Card can carry
 * should mean adding it here (or a new version below), not a new DB column. If this
 * is part of adding a new CardType, see `docs/adding-features.md` at the repo root
 * for the full checklist, including which LLM system prompts might need a look.
 */
export const cardMetadataV1Schema = z.object({
  version: z.literal(1),
  /** ids of related Cards. */
  links: z.array(z.string()).default([]),
  /** Free-form labels the user attaches to a Card — Folders' replacement as the
   *  organizing primitive (Pages + Links + Search rebuild: "folders should not be a
   *  thing"). No separate taxonomy/tree, no per-tag row anywhere: a tag is just text
   *  matched by the Vault's own search (cardService.listCards), the same as a
   *  title/content word — see CardInfoPanel.tsx for where they're added/removed. */
  tags: z.array(z.string()).default([]),
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
  /** A named physical material the Card's own background is styled with (Card
   *  Materials feature) — one of CARD_MATERIAL_IDS (materials.ts). Undefined (the
   *  default for every existing Card) renders as the plain cardstock surface every
   *  Card already has, same "absent means unset, not a real 'none' value"
   *  convention `typeId`'s own doc comment already establishes for this file —
   *  see CardInfoPanel.tsx for the picker that sets/clears this, and
   *  CardShell.css's own `[data-material]` rules for how it renders. */
  material: z.enum(CARD_MATERIAL_IDS).optional(),
  aiParams: z.record(z.unknown()).optional(),
  log: z.array(z.unknown()).default([]),
  /** Which CardTypeDefinition.id this Card is — see lib/getCardTypeId.ts. Omitted
   *  (rather than defaulted here) so getCardTypeId's `?? "note"` stays the one place
   *  that decides what an absent typeId means. */
  typeId: z.string().optional(),
  /** Set only on typeId "file" Cards — where the uploaded file's bytes live on disk
   *  (relative to the API's uploads dir) and its original name/type/size. Text
   *  extraction (fileExtractionService.ts) is never cached here — it's reached
   *  through the Dock's Convert action, which builds a *new* Card from the
   *  extracted text rather than writing anything back onto this one. */
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
  /** Set only on typeId "action" Cards — a calibrated button that runs an ordered
   *  list of jobs (see actionStepSchema above), each one a direct wrapper around an
   *  existing mutation the app already performs elsewhere (creating/renaming/
   *  editing/deleting/moving a Card, creating a Page, navigating, generating,
   *  etc — the runtime registry in web/lib/actionJobRegistry.ts). Deliberately not
   *  a general scripting language: no branching, no loops, no step-to-step data
   *  passing. Steps run strictly in order, client-side, stopping at the first
   *  failure — see ActionCardView.tsx's own Run handler. An inline actionButton
   *  node (richText/actionButtonNode.ts) is the single-job counterpart to this —
   *  same jobId/jobParams shape per entry, calibrated through the same
   *  ActionJobFields/ActionStepFields UI, just never more than one. */
  action: z.preprocess(
    // Upgrades the pre-this-change shape (`{label, jobId, jobParams}`, a single
    // job) into a one-step `steps` list — without this, an old-shape object would
    // just have `jobId`/`jobParams` silently stripped as unknown keys by the
    // object schema below (Zod's default behavior) and `steps` fall back to its
    // `[]` default, silently discarding whatever was configured. Runs on every
    // parse (migrateMetadata below), so existing action Cards upgrade the moment
    // they're next read — no separate DB migration script needed.
    (val) => {
      if (val && typeof val === "object" && !Array.isArray(val) && "jobId" in val && !("steps" in val)) {
        const legacy = val as { label?: unknown; jobId?: unknown; jobParams?: unknown };
        return {
          label: typeof legacy.label === "string" ? legacy.label : "",
          steps:
            typeof legacy.jobId === "string" && legacy.jobId
              ? [{ id: "legacy", jobId: legacy.jobId, jobParams: legacy.jobParams ?? {} }]
              : [],
        };
      }
      return val;
    },
    z
      .object({
        label: z.string(),
        steps: z.array(actionStepSchema).default([]),
      })
      .optional(),
  ),
  /** Set only on typeId "link" Cards — a bookmark to an external URL. The Card's own
   *  `title` is the display title (same convention every other type uses, rather than
   *  registries/definitions/linkCardType.ts's separate, never-enforced `title` field
   *  on its dataSchema); this is just the one field that isn't already covered by an
   *  existing Card column. */
  link: z.object({ url: z.string() }).optional(),
  /** Set only on typeId "pageLinks" Cards — one or more Page navigation targets (see
   *  registries/definitions/pageLinksCardType.ts). `title` is cached per target the
   *  same way a `pageLink` rich-text node caches one (richText/pageLinkNode.ts) —
   *  the live Page's own title, if it's since changed, is what actually renders. */
  pageLinks: z
    .object({
      targets: z.array(z.object({ pageId: z.string(), title: z.string() })).default([]),
    })
    .optional(),
  /** Set only on typeId "search" Cards — a saved query plus which surface it
   *  searches (registries/definitions/searchCardType.ts). Only the query is
   *  persisted; results are always fetched live (never stale, never a second copy
   *  of vault/web data sitting in metadata) — see SearchCardView.tsx. */
  search: z
    .object({
      mode: z.enum(["vault", "web"]),
      query: z.string(),
    })
    .optional(),
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
  /** Set only on typeId "input" Cards — a single answerable form control (see
   *  registries/definitions/inputCardType.ts). `title` is the question/label, same
   *  convention `link`/`pageLinks` use. `options` only matters for the
   *  option-based kinds (radio/dropdown/multiSelect/combobox); `placeholder` only
   *  for the free-text kinds (text/textarea/number/combobox). `value` is always an
   *  array so one write path (InputView.tsx, and the `setInputValue` action job)
   *  covers every kind uniformly: single-value kinds read/write `value[0]`
   *  (checkbox: `"true"` present or absent), multiSelect reads/writes every
   *  entry. */
  input: z
    .object({
      kind: z.enum(["text", "textarea", "number", "checkbox", "radio", "dropdown", "multiSelect", "combobox"]),
      options: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
      placeholder: z.string().optional(),
      value: z.array(z.string()).default([]),
    })
    .optional(),
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
  /** Set only on typeId "js" Cards — a sandboxed, DataviewJS-style live script
   *  (registries/definitions/jsCardType.ts). `source` is the whole script;
   *  `content` (the base Card field every type has) is unused here, same
   *  "the real data lives in a typed metadata field, not content" convention
   *  `search`/`input` above already use. `state` is the ONE thing a script
   *  can explicitly ask to survive a reload (`wattle.state.get`/`set`,
   *  wattleSandboxBootstrap.ts) — everything else (the script's own local
   *  variables) is deliberately NOT persisted here: top-level code re-running
   *  fresh on every load/rerun is the whole DataviewJS-style live-query model
   *  (JsCardView.tsx), and silently keeping local state around would fight
   *  that rather than support it. A script opts in per key, explicitly. */
  js: z
    .object({
      source: z.string(),
      state: z.record(z.unknown()).optional(),
    })
    .optional(),
});

export type CardMetadataV1 = z.infer<typeof cardMetadataV1Schema>;

export const CURRENT_METADATA_VERSION = 1 as const;

export function defaultMetadata(): CardMetadataV1 {
  return {
    version: CURRENT_METADATA_VERSION,
    links: [],
    tags: [],
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

import { z } from "zod";
import { cardMetadataV1Schema } from "./cardMetadata.js";

/**
 * One Card inside a TemplateSnapshotV1 — a self-contained template entry, never a
 * live database id. `typeId`/`title`/`content` mirror the real Card row's own
 * shape; `metadata` is the Card's full CardMetadataV1 (which already carries its
 * own `typeId` too — kept redundantly at the top level since that's the one field
 * every snapshot consumer needs first, e.g. to pick a CardTypeDefinition before it
 * cares about anything else in `metadata`).
 */
export const templateCardSnapshotSchema = z.object({
  typeId: z.string(),
  title: z.string(),
  content: z.string(),
  metadata: cardMetadataV1Schema,
  /** Present only when typeId is "stack" — every alternate (schema.prisma's
   *  StackMember), in order. Which one is active is metadata.stack.activeIndex, same
   *  as a live Stack Card. */
  stackMembers: z
    .array(
      z.object({
        title: z.string(),
        content: z.string(),
        metadata: cardMetadataV1Schema,
      }),
    )
    .optional(),
});

export type TemplateCardSnapshot = z.infer<typeof templateCardSnapshotSchema>;

export const templatePageSnapshotSchema = z.object({
  cards: z.array(templateCardSnapshotSchema),
});

export type TemplatePageSnapshot = z.infer<typeof templatePageSnapshotSchema>;

/** What Template.scope (schema.prisma) chooses between: a whole Tab of Pages, or a
 *  single Page's Cards. */
export const templateScopeSchema = z.enum(["tab", "page"]);

export type TemplateScope = z.infer<typeof templateScopeSchema>;

/**
 * Versioned, self-contained portable template stored in Template.snapshot
 * (schema.prisma) — the same versioning convention as CardMetadataV1
 * (cardMetadata.ts). Always built and consumed server-side (templateService.ts):
 * never trust a snapshot sent from the browser, and never let one carry a live
 * database id, so opening it always produces brand-new Cards/Pages/(Tab).
 */
export const templateSnapshotV1Schema = z.discriminatedUnion("scope", [
  z.object({
    version: z.literal(1),
    scope: z.literal("page"),
    cards: z.array(templateCardSnapshotSchema),
  }),
  z.object({
    version: z.literal(1),
    scope: z.literal("tab"),
    pages: z.array(templatePageSnapshotSchema),
  }),
]);

export type TemplateSnapshotV1 = z.infer<typeof templateSnapshotV1Schema>;

export const CURRENT_TEMPLATE_SNAPSHOT_VERSION = 1 as const;

/**
 * Parses raw snapshot JSON (from the DB) and upgrades it to the current shape — same
 * version-dispatch structure as cardMetadata.ts's migrateMetadata, and for the same
 * reason: a future v2 branch can be added without any call site needing to change.
 */
export function migrateTemplateSnapshot(raw: unknown): TemplateSnapshotV1 {
  const obj: Record<string, unknown> =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const version = obj.version;

  if (version === undefined || version === 1) {
    return templateSnapshotV1Schema.parse({ ...obj, version: 1 });
  }

  throw new Error(`Unsupported Template snapshot version: ${String(version)}`);
}

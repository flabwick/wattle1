import { z } from "zod";

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
});

export type CardMetadataV1 = z.infer<typeof cardMetadataV1Schema>;

export const CURRENT_METADATA_VERSION = 1 as const;

export function defaultMetadata(): CardMetadataV1 {
  return {
    version: CURRENT_METADATA_VERSION,
    links: [],
    log: [],
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

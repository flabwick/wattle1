import type { Card, CreateCardInput, UpdateCardInput } from "@wattle/shared";
import { cardMetadataV1Schema, defaultMetadata, migrateMetadata } from "@wattle/shared";
import { prisma } from "../db.js";
import * as proximityService from "./proximityService.js";
import * as summaryService from "./summaryService.js";
import { syncPageLinksForPage } from "./pageLinkService.js";

/** Card.metadata is stored as a JSON string (see schema.prisma); parse defensively. */
function parseMetadataColumn(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Shared by every place that turns a Card row (or a Prisma-nested `card`) into a Card. */
export function serializeCard(card: {
  id: string;
  title: string;
  content: string;
  metadata: string;
  savedToVault: boolean;
  frozenAt: Date | null;
  forkedFromId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Card {
  return {
    id: card.id,
    title: card.title,
    content: card.content,
    metadata: migrateMetadata(parseMetadataColumn(card.metadata)),
    savedToVault: card.savedToVault,
    frozenAt: card.frozenAt ? card.frozenAt.toISOString() : null,
    forkedFromId: card.forkedFromId,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

/** Every saved Card whose `metadata.tags` array has an entry containing `query`
 *  (case-insensitive substring, same convention as the title/content match below) —
 *  tags replace Folders as the organizing primitive (Pages + Links + Search rebuild:
 *  "folders should not be a thing"), so search is how they're found, not a tree to
 *  browse. Metadata is stored as a JSON string (schema.prisma), not a queryable
 *  column, so this reaches into it via SQLite's `json_each` table-valued function
 *  rather than a Prisma filter — id-only, so the actual Card rows still come back
 *  through Prisma's own normal (type-safe) hydration in listCards below. */
async function findCardIdsByTag(query: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT c.id AS id
    FROM "Card" c, json_each(c.metadata, '$.tags') t
    WHERE c."savedToVault" = 1 AND t.value LIKE '%' || ${query} || '%' COLLATE NOCASE
  `;
  return rows.map((r) => r.id);
}

/** The vault list only ever shows Cards that have actually been saved there — a Card
 *  created inside a Page (or by a generation) is page-local scratch content until its
 *  Save action runs (see schema.prisma's Card.savedToVault doc comment). */
export async function listCards(query?: string): Promise<Card[]> {
  const tagMatchIds = query ? await findCardIdsByTag(query) : [];
  const cards = await prisma.card.findMany({
    where: {
      savedToVault: true,
      ...(query
        ? {
            OR: [
              { title: { contains: query } },
              { content: { contains: query } },
              { id: { in: tagMatchIds } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  return cards.map(serializeCard);
}

export async function getCard(id: string): Promise<Card | null> {
  const card = await prisma.card.findUnique({ where: { id } });
  return card ? serializeCard(card) : null;
}

/** Creates a Card directly in the vault (savedToVault defaults to true — see
 *  schema.prisma). A title is never required — a Card can have no title by default,
 *  same as a Page (see schema.prisma's Page.title doc comment); nothing here forces
 *  a placeholder value into it. */
export async function createCard(input: CreateCardInput): Promise<Card> {
  const metadata = input.metadata === undefined ? defaultMetadata() : cardMetadataV1Schema.parse(input.metadata);
  const card = await prisma.card.create({
    data: {
      title: input.title,
      content: input.content,
      metadata: JSON.stringify(metadata),
    },
  });
  return serializeCard(card);
}

export interface UploadedFile {
  storedName: string;
  originalName: string;
  mimeType: string;
  size: number;
}

/** Uploads a file straight into the vault (the Vault panel's own Upload action) — a
 *  real, already-savedToVault "file"-typed Card from the start, unlike
 *  pageCardService.addFileCardToPage/dockCardService.addFileCardToDock's page/Dock-
 *  local scratch versions, since there's no Page or Dock row for this one to be
 *  scratch content *of*: the vault is where it's being added directly. */
export async function createFileCard(file: UploadedFile): Promise<Card> {
  const card = await prisma.card.create({
    data: {
      title: file.originalName,
      content: "",
      metadata: JSON.stringify({
        ...defaultMetadata(),
        typeId: "file",
        file: {
          storedName: file.storedName,
          originalName: file.originalName,
          mimeType: file.mimeType,
          size: file.size,
        },
      }),
    },
  });
  return serializeCard(card);
}

/** Used both for a genuine vault Card rename (VaultView) and for a still page-local
 *  Dock Card's "writes straight through" editing (see dockCardService's doc comment
 *  on DockCard) — blank is always allowed, whether or not the Card is already
 *  savedToVault (see createCard's own doc comment: no title is ever required). */
export async function updateCard(
  id: string,
  input: UpdateCardInput,
): Promise<Card> {
  const existing = await prisma.card.findUniqueOrThrow({ where: { id } });
  if (existing.frozenAt) {
    throw new Error("A Frozen Card can't be edited directly — fork it first");
  }
  const card = await prisma.card.update({
    where: { id },
    data: {
      title: input.title,
      content: input.content,
      ...(input.metadata !== undefined
        ? { metadata: JSON.stringify(cardMetadataV1Schema.parse(input.metadata)) }
        : {}),
    },
  });
  const serialized = serializeCard(card);
  if (existing.savedToVault && input.content !== undefined) {
    await proximityService.reinforceContentLinks(serialized);
    summaryService.scheduleSummaryRefresh(serialized.id);
    const placements = await prisma.pageCard.findMany({ where: { cardId: id }, select: { pageId: true } });
    await Promise.all([...new Set(placements.map((p) => p.pageId))].map((pageId) => syncPageLinksForPage(pageId)));
  }
  return serialized;
}

export async function deleteCard(id: string): Promise<void> {
  await prisma.card.delete({ where: { id } });
}

/** Freezes a Card: read-only from here on, safe as stable context to link/embed
 *  against (Wattle vault plan's Open/Frozen). Only a real vault Card can be frozen —
 *  page-local scratch content has nothing stable to freeze yet — and freezing an
 *  already-Frozen Card is a no-op error rather than silently refreshing the
 *  timestamp, so callers don't accidentally reset it. */
export async function freezeCard(id: string): Promise<Card> {
  const existing = await prisma.card.findUniqueOrThrow({ where: { id } });
  if (!existing.savedToVault) {
    throw new Error("Only a Card already saved to the vault can be frozen");
  }
  if (existing.frozenAt) {
    throw new Error("Card is already frozen");
  }
  const card = await prisma.card.update({ where: { id }, data: { frozenAt: new Date() } });
  return serializeCard(card);
}

/** Forks a Frozen Card: a brand-new Card copying its title/content/metadata, Open and
 *  independently editable, `forkedFromId` pointing back at the Frozen original — which
 *  is never mutated by this. The caller (pageCardService/dockCardService's
 *  forkOccurrence) is responsible for repointing whichever PageCard/DockCard occurrence
 *  triggered this at the new fork's id. */
export async function forkCard(id: string): Promise<Card> {
  const original = await prisma.card.findUniqueOrThrow({ where: { id } });
  if (!original.frozenAt) {
    throw new Error("Only a Frozen Card can be forked");
  }
  const fork = await prisma.card.create({
    data: {
      title: original.title,
      content: original.content,
      metadata: original.metadata,
      savedToVault: true,
      forkedFromId: original.id,
    },
  });
  await proximityService.reinforceFork(original.id, fork.id);
  return serializeCard(fork);
}

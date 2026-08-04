import type { Card, CreateCardInput, UpdateCardInput } from "@wattle/shared";
import { cardMetadataV1Schema, defaultMetadata, migrateMetadata } from "@wattle/shared";
import { prisma } from "../db.js";
import * as proximityService from "./proximityService.js";
import * as summaryService from "./summaryService.js";

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
  folderId: string | null;
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
    folderId: card.folderId,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

/** The vault list only ever shows Cards that have actually been saved there — a Card
 *  created inside a Page (or by a generation) is page-local scratch content until its
 *  Save action runs (see schema.prisma's Card.savedToVault doc comment). */
export async function listCards(query?: string): Promise<Card[]> {
  const cards = await prisma.card.findMany({
    where: {
      savedToVault: true,
      ...(query
        ? {
            OR: [
              { title: { contains: query } },
              { content: { contains: query } },
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
 *  schema.prisma) — unlike a Page-local/Dock-local Card, there's no later "save"
 *  transition to enforce a title at, so it's required from the start here. */
export async function createCard(input: CreateCardInput): Promise<Card> {
  if (input.title.trim() === "") {
    throw new Error("A title is required to save a Card to the vault");
  }
  const metadata = input.metadata === undefined ? defaultMetadata() : cardMetadataV1Schema.parse(input.metadata);
  const card = await prisma.card.create({
    data: {
      title: input.title,
      content: input.content,
      metadata: JSON.stringify(metadata),
      folderId: input.folderId ?? null,
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
export async function createFileCard(file: UploadedFile, folderId: string | null): Promise<Card> {
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
      folderId,
    },
  });
  return serializeCard(card);
}

/** Moves a Card to a different Folder (or to the vault root, if `folderId` is null). */
export async function moveCard(id: string, folderId: string | null): Promise<Card> {
  const card = await prisma.card.update({
    where: { id },
    data: { folderId },
  });
  return serializeCard(card);
}

/** Used both for a genuine vault Card rename (VaultView) and for a still page-local
 *  Dock Card's "writes straight through" editing (see dockCardService's doc comment
 *  on DockCard) — so blank is only rejected once the Card is actually savedToVault;
 *  a not-yet-saved Dock Card can still go blank freely, same as any other scratch
 *  content. */
export async function updateCard(
  id: string,
  input: UpdateCardInput,
): Promise<Card> {
  const existing = await prisma.card.findUniqueOrThrow({ where: { id } });
  if (existing.frozenAt) {
    throw new Error("A Frozen Card can't be edited directly — fork it first");
  }
  if (input.title !== undefined && input.title.trim() === "") {
    if (existing.savedToVault) {
      throw new Error("A title is required to save a Card to the vault");
    }
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
      folderId: original.folderId,
      forkedFromId: original.id,
    },
  });
  await proximityService.reinforceFork(original.id, fork.id);
  return serializeCard(fork);
}

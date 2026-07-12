import type { Folder, FolderContents } from "@wattle/shared";
import { prisma } from "../db.js";
import { serializeCard } from "./cardService.js";

interface FolderRow {
  id: string;
  title: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function serializeFolder(folder: FolderRow): Folder {
  return {
    id: folder.id,
    title: folder.title,
    parentId: folder.parentId,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}

/** Explicitly typed so `parentId`-chasing loops (breadcrumbFor, assertNotDescendant)
 *  don't ask TS to infer through Prisma's generic findUnique in a loop. */
async function getFolderRow(id: string): Promise<FolderRow | null> {
  return prisma.folder.findUnique({ where: { id } });
}

export async function getFolder(id: string): Promise<Folder | null> {
  const folder = await getFolderRow(id);
  return folder ? serializeFolder(folder) : null;
}

/** Root-to-parent ancestor chain for a Folder, not including the Folder itself. */
async function breadcrumbFor(folderId: string | null): Promise<Folder[]> {
  const chain: Folder[] = [];
  let currentId = folderId;
  while (currentId) {
    const folder: FolderRow | null = await getFolderRow(currentId);
    if (!folder) break;
    chain.unshift(serializeFolder(folder));
    currentId = folder.parentId;
  }
  chain.pop(); // drop the folder itself, keeping only its ancestors
  return chain;
}

/** One screen's worth of vault browsing: `folderId`'s immediate subfolders and Cards,
 *  plus the breadcrumb to render above them. `folderId` null means the vault root. */
export async function listFolderContents(folderId: string | null): Promise<FolderContents> {
  const [folder, folders, cards] = await Promise.all([
    folderId ? getFolder(folderId) : Promise.resolve(null),
    prisma.folder.findMany({ where: { parentId: folderId }, orderBy: { title: "asc" } }),
    prisma.card.findMany({
      where: { folderId, savedToVault: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return {
    folder,
    breadcrumb: folderId ? await breadcrumbFor(folderId) : [],
    folders: folders.map(serializeFolder),
    cards: cards.map(serializeCard),
  };
}

export async function createFolder(title: string, parentId: string | null): Promise<Folder> {
  const folder = await prisma.folder.create({ data: { title, parentId } });
  return serializeFolder(folder);
}

export async function renameFolder(id: string, title: string): Promise<Folder> {
  const folder = await prisma.folder.update({ where: { id }, data: { title } });
  return serializeFolder(folder);
}

/** Throws if `targetParentId` is `movingId` itself or one of its descendants — moving a
 *  Folder into its own subtree would create a cycle the parent-pointer tree can't express. */
async function assertNotDescendant(movingId: string, targetParentId: string): Promise<void> {
  if (targetParentId === movingId) {
    throw new Error("Cannot move a folder into itself");
  }
  let currentId: string | null = targetParentId;
  while (currentId) {
    const folder: FolderRow | null = await getFolderRow(currentId);
    if (!folder) return;
    if (folder.parentId === movingId) {
      throw new Error("Cannot move a folder into one of its own subfolders");
    }
    currentId = folder.parentId;
  }
}

export async function moveFolder(id: string, parentId: string | null): Promise<Folder> {
  if (parentId) {
    await assertNotDescendant(id, parentId);
  }
  const folder = await prisma.folder.update({ where: { id }, data: { parentId } });
  return serializeFolder(folder);
}

/** Deletes a Folder and, via schema.prisma's `onDelete: Cascade`, everything inside it
 *  (Cards and subfolders, recursively) — a deliberate product choice, not an oversight. */
export async function deleteFolder(id: string): Promise<void> {
  await prisma.folder.delete({ where: { id } });
}

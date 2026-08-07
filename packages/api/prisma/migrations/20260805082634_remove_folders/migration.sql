/*
  Warnings:

  - You are about to drop the `Folder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `folderId` on the `Card` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Folder_parentId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Folder";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "savedToVault" BOOLEAN NOT NULL DEFAULT true,
    "frozenAt" DATETIME,
    "forkedFromId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Card_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "Card" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Card" ("content", "createdAt", "forkedFromId", "frozenAt", "id", "metadata", "savedToVault", "title", "updatedAt") SELECT "content", "createdAt", "forkedFromId", "frozenAt", "id", "metadata", "savedToVault", "title", "updatedAt" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

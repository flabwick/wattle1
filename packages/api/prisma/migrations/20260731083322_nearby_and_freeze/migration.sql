-- CreateTable
CREATE TABLE "CardProximity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardAId" TEXT NOT NULL,
    "cardBId" TEXT NOT NULL,
    "score" REAL NOT NULL DEFAULT 0,
    "lastReinforcedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardProximity_cardAId_fkey" FOREIGN KEY ("cardAId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardProximity_cardBId_fkey" FOREIGN KEY ("cardBId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "folderId" TEXT,
    CONSTRAINT "Card_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "Card" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Card_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Card" ("content", "createdAt", "folderId", "id", "metadata", "savedToVault", "title", "updatedAt") SELECT "content", "createdAt", "folderId", "id", "metadata", "savedToVault", "title", "updatedAt" FROM "Card";
DROP TABLE "Card";
ALTER TABLE "new_Card" RENAME TO "Card";
CREATE INDEX "Card_folderId_idx" ON "Card"("folderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CardProximity_cardAId_idx" ON "CardProximity"("cardAId");

-- CreateIndex
CREATE INDEX "CardProximity_cardBId_idx" ON "CardProximity"("cardBId");

-- CreateIndex
CREATE UNIQUE INDEX "CardProximity_cardAId_cardBId_key" ON "CardProximity"("cardAId", "cardBId");

-- CreateTable
CREATE TABLE "Embed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentCardId" TEXT,
    "parentPageCardId" TEXT,
    "parentIsPageCard" BOOLEAN NOT NULL,
    "targetCardId" TEXT,
    "snapshotTitle" TEXT,
    "snapshotContent" TEXT,
    "mode" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Embed_parentCardId_fkey" FOREIGN KEY ("parentCardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Embed_parentPageCardId_fkey" FOREIGN KEY ("parentPageCardId") REFERENCES "PageCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Embed_targetCardId_fkey" FOREIGN KEY ("targetCardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Embed_parentCardId_idx" ON "Embed"("parentCardId");

-- CreateIndex
CREATE INDEX "Embed_parentPageCardId_idx" ON "Embed"("parentPageCardId");

-- CreateIndex
CREATE INDEX "Embed_targetCardId_idx" ON "Embed"("targetCardId");

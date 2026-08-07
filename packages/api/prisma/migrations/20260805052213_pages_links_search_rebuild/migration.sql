-- CreateTable
CREATE TABLE "PageLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourcePageId" TEXT NOT NULL,
    "targetPageId" TEXT NOT NULL,
    CONSTRAINT "PageLink_sourcePageId_fkey" FOREIGN KEY ("sourcePageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PageLink_targetPageId_fkey" FOREIGN KEY ("targetPageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "homePageId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_homePageId_fkey" FOREIGN KEY ("homePageId") REFERENCES "Page" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Page" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tabId" TEXT,
    "siblingGroupId" TEXT,
    "orderInGroup" INTEGER,
    "pinnedOrder" INTEGER,
    CONSTRAINT "Page_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "Tab" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Page" ("createdAt", "id", "order", "tabId", "updatedAt") SELECT "createdAt", "id", "order", "tabId", "updatedAt" FROM "Page";
DROP TABLE "Page";
ALTER TABLE "new_Page" RENAME TO "Page";
CREATE INDEX "Page_tabId_idx" ON "Page"("tabId");
CREATE INDEX "Page_siblingGroupId_idx" ON "Page"("siblingGroupId");
CREATE INDEX "Page_title_idx" ON "Page"("title");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PageLink_targetPageId_idx" ON "PageLink"("targetPageId");

-- CreateIndex
CREATE UNIQUE INDEX "PageLink_sourcePageId_targetPageId_key" ON "PageLink"("sourcePageId", "targetPageId");

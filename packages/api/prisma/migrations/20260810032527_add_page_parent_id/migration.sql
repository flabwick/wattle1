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
    "parentPageId" TEXT,
    CONSTRAINT "Page_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "Tab" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Page_parentPageId_fkey" FOREIGN KEY ("parentPageId") REFERENCES "Page" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Page" ("createdAt", "id", "order", "orderInGroup", "pinnedOrder", "siblingGroupId", "tabId", "title", "updatedAt") SELECT "createdAt", "id", "order", "orderInGroup", "pinnedOrder", "siblingGroupId", "tabId", "title", "updatedAt" FROM "Page";
DROP TABLE "Page";
ALTER TABLE "new_Page" RENAME TO "Page";
CREATE INDEX "Page_tabId_idx" ON "Page"("tabId");
CREATE INDEX "Page_siblingGroupId_idx" ON "Page"("siblingGroupId");
CREATE INDEX "Page_title_idx" ON "Page"("title");
CREATE INDEX "Page_parentPageId_idx" ON "Page"("parentPageId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

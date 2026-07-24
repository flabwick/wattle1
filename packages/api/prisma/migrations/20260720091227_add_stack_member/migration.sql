-- CreateTable
CREATE TABLE "StackMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stackCardId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "draftTitle" TEXT,
    "draftContent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StackMember_stackCardId_fkey" FOREIGN KEY ("stackCardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StackMember_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StackMember_cardId_key" ON "StackMember"("cardId");

-- CreateIndex
CREATE INDEX "StackMember_stackCardId_idx" ON "StackMember"("stackCardId");

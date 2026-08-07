-- RenameTable
ALTER TABLE "App" RENAME TO "Template";

-- RenameIndex
DROP INDEX "App_slug_key";
CREATE UNIQUE INDEX "Template_slug_key" ON "Template"("slug");

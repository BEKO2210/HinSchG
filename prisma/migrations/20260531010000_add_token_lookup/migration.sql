-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "tokenLookup" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Case_tokenLookup_key" ON "Case"("tokenLookup");


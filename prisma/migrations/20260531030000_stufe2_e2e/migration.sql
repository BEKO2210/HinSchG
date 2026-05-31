-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "encryptionVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "wbPublicKey" TEXT;

-- AlterTable
ALTER TABLE "ReportingOffice" ADD COLUMN     "encryptedRecoveryPrivateKey" TEXT,
ADD COLUMN     "recoveryPublicKey" TEXT;

-- CreateTable
CREATE TABLE "CaseKey" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "wrappedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseMessageKey" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "wrappedKey" TEXT NOT NULL,

    CONSTRAINT "CaseMessageKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseKey_caseId_idx" ON "CaseKey"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseKey_caseId_recipient_key" ON "CaseKey"("caseId", "recipient");

-- CreateIndex
CREATE INDEX "CaseMessageKey_messageId_idx" ON "CaseMessageKey"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseMessageKey_messageId_recipient_key" ON "CaseMessageKey"("messageId", "recipient");

-- AddForeignKey
ALTER TABLE "CaseKey" ADD CONSTRAINT "CaseKey_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseMessageKey" ADD CONSTRAINT "CaseMessageKey_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CaseMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;


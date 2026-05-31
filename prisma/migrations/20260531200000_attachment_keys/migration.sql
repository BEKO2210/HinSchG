-- CaseAttachment: Stufe-2-E2E-Anhaenge. Schluessel-Wraps je Empfaenger in
-- CaseAttachmentKey (analog CaseMessageKey). Es wird nie Klartext gespeichert.

CREATE TABLE "CaseAttachmentKey" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "wrappedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseAttachmentKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CaseAttachmentKey_attachmentId_recipient_key" ON "CaseAttachmentKey"("attachmentId", "recipient");
CREATE INDEX "CaseAttachmentKey_attachmentId_idx" ON "CaseAttachmentKey"("attachmentId");

ALTER TABLE "CaseAttachmentKey"
  ADD CONSTRAINT "CaseAttachmentKey_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "CaseAttachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

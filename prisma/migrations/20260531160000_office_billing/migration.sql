-- Managed-Billing (Phase 10b): Referenzen auf den Zahlungsanbieter (Stripe).
-- AUSSCHLIESSLICH undurchsichtige Referenz-IDs — keine Kartendaten/Adressen.
-- managedProcessing = Zusatzleistung (Fallbearbeitung durch Befugte), org. Flag.

ALTER TABLE "ReportingOffice" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "ReportingOffice" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "ReportingOffice" ADD COLUMN "managedProcessing" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "ReportingOffice_stripeCustomerId_key" ON "ReportingOffice"("stripeCustomerId");
CREATE UNIQUE INDEX "ReportingOffice_stripeSubscriptionId_key" ON "ReportingOffice"("stripeSubscriptionId");

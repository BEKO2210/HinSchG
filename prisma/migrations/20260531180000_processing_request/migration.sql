-- Phase 11a: Self-Service-Status fuer die managedProcessing-Leistung
-- (Fallbearbeitung durch befugte Personen). Aendert KEINE Zugriffsrechte.

CREATE TYPE "ProcessingRequestStatus" AS ENUM ('NONE', 'REQUESTED', 'ACTIVE', 'DECLINED');

ALTER TABLE "ReportingOffice"
  ADD COLUMN "processingRequest" "ProcessingRequestStatus" NOT NULL DEFAULT 'NONE';

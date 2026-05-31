-- Managed-Layer (Phase 10a): Tarif + Abo-Status je Meldestelle.
-- Keine Zahlungsdaten. Limits werden im Code (src/lib/plans.ts) definiert und
-- nur wirksam, wenn der Managed-Layer aktiviert ist (BILLING_ENABLED=true).

CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

ALTER TABLE "ReportingOffice" ADD COLUMN "plan" "Plan" NOT NULL DEFAULT 'FREE';
ALTER TABLE "ReportingOffice" ADD COLUMN "planStatus" "PlanStatus" NOT NULL DEFAULT 'ACTIVE';

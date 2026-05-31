-- Multi-Tenant (Phase 9c): Plattform-Superadmin + deaktivierbare Meldestellen.

-- Neue Rolle SUPERADMIN (Plattform-Verwaltung; kein Zugriff auf Fall-Inhalte).
ALTER TYPE "HandlerRole" ADD VALUE 'SUPERADMIN' BEFORE 'ADMIN';

-- Meldestellen koennen deaktiviert werden (nehmen dann keine neuen Meldungen an).
ALTER TABLE "ReportingOffice" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

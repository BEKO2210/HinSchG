-- Multi-Tenant (Phase 9a): Audit-Eintraege je Meldestelle zuordnen.
-- Nullable fuer bestehende Eintraege und instanzweite Systemereignisse.
ALTER TABLE "AuditLog" ADD COLUMN "officeId" TEXT;

CREATE INDEX "AuditLog_officeId_idx" ON "AuditLog"("officeId");

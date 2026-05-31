// HinSchG — Konfigurierbare Löschfristen für geschlossene Fälle
//
// Geschlossene/abgelehnte Fälle (closedAt gesetzt) werden nach Ablauf der
// Aufbewahrungsfrist vollständig gelöscht (inkl. verschlüsselter Inhalte und
// Nachrichten via Cascade). Der Audit-Trail bleibt erhalten (enthält keine PII)
// und erhält einen CASE_PURGED-Eintrag.

import type { PrismaClient } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Aufbewahrungsdauer in Tagen aus der Umgebung (0/ungesetzt = deaktiviert). */
export function getRetentionDays(): number {
  const raw = process.env.CASE_RETENTION_DAYS;
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Pure Prüfung, ob ein geschlossener Fall die Aufbewahrungsfrist überschritten hat. */
export function isCaseExpired(
  closedAt: Date | null,
  retentionDays: number,
  now: number = Date.now(),
): boolean {
  if (!closedAt || retentionDays <= 0) {
    return false;
  }
  return closedAt.getTime() + retentionDays * DAY_MS <= now;
}

/**
 * Löscht alle abgelaufenen geschlossenen Fälle und protokolliert CASE_PURGED.
 * Gibt die Anzahl gelöschter Fälle zurück.
 */
export async function purgeExpiredCases(
  prisma: PrismaClient,
  retentionDays: number = getRetentionDays(),
  now: number = Date.now(),
): Promise<number> {
  if (retentionDays <= 0) {
    return 0;
  }
  const cutoff = new Date(now - retentionDays * DAY_MS);
  const expired = await prisma.case.findMany({
    where: { closedAt: { not: null, lte: cutoff } },
    select: { id: true },
  });

  let purged = 0;
  for (const { id } of expired) {
    await prisma.$transaction(async (tx) => {
      await tx.case.delete({ where: { id } });
      await tx.auditLog.create({
        data: { actorType: 'SYSTEM', action: 'CASE_PURGED', caseId: id },
      });
    });
    purged += 1;
  }
  return purged;
}

// HinSchG — Wartungsskript: abgelaufene geschlossene Fälle löschen
//
// Per Cron ausführen, z. B. täglich:  CASE_RETENTION_DAYS=365 npm run purge:cases

import { PrismaClient } from '@prisma/client';
import { getRetentionDays, purgeExpiredCases } from '../src/lib/retention';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const days = getRetentionDays();
  if (days <= 0) {
    console.log('CASE_RETENTION_DAYS ist nicht gesetzt oder 0 — keine Löschung.');
    return;
  }
  const purged = await purgeExpiredCases(prisma, days);
  console.log(`Gelöscht: ${purged} geschlossene Fälle (Aufbewahrung ${days} Tage).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Purge fehlgeschlagen:', error);
    await prisma.$disconnect();
    process.exit(1);
  });

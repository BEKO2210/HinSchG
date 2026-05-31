// HinSchG — Seed-Skript
//
// Legt idempotent eine Demo-Meldestelle und einen Admin-Bearbeiter an.
// Das Admin-Passwort kommt ausschliesslich aus der Umgebung (SEED_ADMIN_PASSWORD)
// und wird mit Argon2id gehasht gespeichert — niemals im Klartext.

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/crypto';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.org';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword) {
    throw new Error(
      'SEED_ADMIN_PASSWORD ist nicht gesetzt. Bitte ein starkes Passwort in der Umgebung setzen, z. B.:\n' +
        '  SEED_ADMIN_PASSWORD="$(openssl rand -base64 24)" npm run prisma:seed',
    );
  }

  // Demo-Meldestelle (idempotent ueber den eindeutigen slug).
  const office = await prisma.reportingOffice.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo-Meldestelle',
      slug: 'demo',
    },
  });

  // Admin-Bearbeiter (idempotent ueber die eindeutige E-Mail). Passwort wird
  // bei jedem Lauf neu gehasht, damit eine Aenderung von SEED_ADMIN_PASSWORD
  // wirksam wird.
  const passwordHash = hashPassword(adminPassword);
  await prisma.handler.upsert({
    where: { email: adminEmail },
    update: { passwordHash, role: 'ADMIN', officeId: office.id },
    create: {
      email: adminEmail,
      passwordHash,
      role: 'ADMIN',
      officeId: office.id,
    },
  });

  // Zweite Meldestelle (nur fuer Mandantentrennungs-Tests). Wird ausschliesslich
  // mit SEED_SECOND_OFFICE=true angelegt — niemals im normalen/produktiven Seed.
  // Enthaelt einen eigenen Fall, der nachweislich NICHT fuer Bearbeiter:innen der
  // ersten Meldestelle sichtbar sein darf (Cross-Tenant-Isolations-Test).
  if (process.env.SEED_SECOND_OFFICE === 'true') {
    const office2 = await prisma.reportingOffice.upsert({
      where: { slug: 'demo2' },
      update: {},
      create: { name: 'Zweite Meldestelle', slug: 'demo2' },
    });
    const { encryptPayload, generateReceiptToken, hashToken, tokenBlindIndex } = await import(
      '../src/lib/crypto'
    );
    const { computeDeadlines } = await import('../src/lib/cases');
    const token = generateReceiptToken();
    const { deadlineAck, deadlineFeedback } = computeDeadlines();
    await prisma.case.upsert({
      where: { tokenLookup: tokenBlindIndex(token) },
      update: {},
      create: {
        officeId: office2.id,
        tokenHash: hashToken(token),
        tokenLookup: tokenBlindIndex(token),
        category: 'sonstiges',
        encryptedPayload: encryptPayload(
          JSON.stringify({
            description: 'Fall der zweiten Meldestelle',
            incidentDate: null,
            contact: null,
          }),
        ),
        deadlineAck,
        deadlineFeedback,
      },
    });
    console.log(`Zweite Meldestelle "${office2.name}" inkl. Testfall angelegt.`);
  }

  // Bewusst KEINE Klartext-Ausgabe des Passworts.
  console.log(`Seed abgeschlossen: Meldestelle "${office.name}" + Admin <${adminEmail}>.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Seed fehlgeschlagen:', error);
    await prisma.$disconnect();
    process.exit(1);
  });

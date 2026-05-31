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

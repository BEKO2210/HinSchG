// HinSchG — API: Meldestellen verwalten (nur SUPERADMIN)
//
// Phase 9c: Plattform-Superadmins legen neue Meldestellen an. Beim Anlegen wird
// optional ein:e Initial-ADMIN fuer die neue Meldestelle erstellt, damit diese
// sofort betriebsbereit ist. Der Superadmin erhaelt KEINEN Zugriff auf
// Fall-Inhalte — er verwaltet ausschliesslich Metadaten der Meldestellen.

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { hashPassword } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { HANDLER_PASSWORD_MIN } from '@/lib/handlers';
import { isValidOfficeName, isValidOfficeSlug, slugifyOfficeName } from '@/lib/office';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CreateBody {
  name?: unknown;
  slug?: unknown;
  adminEmail?: unknown;
  adminPassword?: unknown;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request): Promise<NextResponse> {
  const guard = adminApiGuard(['SUPERADMIN']);
  if ('error' in guard) {
    return guard.error;
  }

  let raw: CreateBody;
  try {
    raw = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 });
  }

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!isValidOfficeName(name)) {
    return NextResponse.json({ error: 'Bitte einen gültigen Namen angeben.' }, { status: 400 });
  }

  // Slug: explizit angegeben oder aus dem Namen abgeleitet; immer strikt prüfen.
  const slugInput =
    typeof raw.slug === 'string' && raw.slug.trim() ? raw.slug.trim() : slugifyOfficeName(name);
  if (!isValidOfficeSlug(slugInput)) {
    return NextResponse.json(
      { error: 'Ungültiger Slug (nur a–z, 0–9, Bindestrich; 1–64 Zeichen).' },
      { status: 400 },
    );
  }

  // Optionaler Initial-ADMIN für die neue Meldestelle.
  const adminEmail = typeof raw.adminEmail === 'string' ? raw.adminEmail.trim().toLowerCase() : '';
  const adminPassword = typeof raw.adminPassword === 'string' ? raw.adminPassword : '';
  const wantsAdmin = adminEmail.length > 0 || adminPassword.length > 0;
  if (wantsAdmin) {
    if (!isValidEmail(adminEmail)) {
      return NextResponse.json(
        { error: 'Bitte eine gültige E-Mail für den Initial-Admin angeben.' },
        { status: 400 },
      );
    }
    if (adminPassword.length < HANDLER_PASSWORD_MIN) {
      return NextResponse.json(
        { error: `Das Admin-Passwort muss mindestens ${HANDLER_PASSWORD_MIN} Zeichen lang sein.` },
        { status: 400 },
      );
    }
  }

  // Eindeutigkeit prüfen (Slug global eindeutig; E-Mail global eindeutig).
  const slugTaken = await prisma.reportingOffice.findUnique({
    where: { slug: slugInput },
    select: { id: true },
  });
  if (slugTaken) {
    return NextResponse.json({ error: 'Dieser Slug ist bereits vergeben.' }, { status: 409 });
  }
  if (wantsAdmin) {
    const emailTaken = await prisma.handler.findUnique({
      where: { email: adminEmail },
      select: { id: true },
    });
    if (emailTaken) {
      return NextResponse.json(
        { error: 'Es existiert bereits ein Bearbeiter mit dieser E-Mail.' },
        { status: 409 },
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const office = await tx.reportingOffice.create({
      data: { name, slug: slugInput },
      select: { id: true, slug: true },
    });
    if (wantsAdmin) {
      await tx.handler.create({
        data: {
          email: adminEmail,
          passwordHash: hashPassword(adminPassword),
          role: 'ADMIN',
          officeId: office.id,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorType: 'HANDLER',
        actorId: guard.session.h,
        action: 'OFFICE_CREATED',
        officeId: office.id,
        // Keine PII: nur Slug + ob ein Initial-Admin angelegt wurde.
        metadata: { slug: office.slug, withAdmin: wantsAdmin },
      },
    });
    return office;
  });

  return NextResponse.json({ ok: true, id: created.id, slug: created.slug }, { status: 201 });
}

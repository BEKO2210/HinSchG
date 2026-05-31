// HinSchG — API: einzelne Meldestelle ändern (nur SUPERADMIN)
//
// Phase 9c: Umbenennen und Aktivieren/Deaktivieren. Deaktivierte Meldestellen
// nehmen keine neuen Meldungen mehr an und sind öffentlich nicht erreichbar.
// Der Superadmin erhält keinen Zugriff auf Fall-Inhalte.

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import { isValidOfficeName } from '@/lib/office';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PatchBody {
  name?: unknown;
  active?: unknown;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const guard = adminApiGuard(['SUPERADMIN']);
  if ('error' in guard) {
    return guard.error;
  }

  let raw: PatchBody;
  try {
    raw = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 });
  }

  const data: { name?: string; active?: boolean } = {};
  if (raw.name !== undefined) {
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!isValidOfficeName(name)) {
      return NextResponse.json({ error: 'Bitte einen gültigen Namen angeben.' }, { status: 400 });
    }
    data.name = name;
  }
  if (raw.active !== undefined) {
    if (typeof raw.active !== 'boolean') {
      return NextResponse.json({ error: 'Ungültiger Aktiv-Status.' }, { status: 400 });
    }
    data.active = raw.active;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen angegeben.' }, { status: 400 });
  }

  const existing = await prisma.reportingOffice.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Meldestelle nicht gefunden.' }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.reportingOffice.update({ where: { id: existing.id }, data });
    await tx.auditLog.create({
      data: {
        actorType: 'HANDLER',
        actorId: guard.session.h,
        action: 'OFFICE_UPDATED',
        officeId: existing.id,
        metadata: {
          ...(data.name !== undefined ? { renamed: true } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
        },
      },
    });
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

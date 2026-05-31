// HinSchG — API: Bearbeiter anlegen (nur ADMIN)
//
// Rolle wird serverseitig erzwungen. Der neue Bearbeiter richtet seine TOTP-2FA
// beim ersten Login selbst ein. Mandantentrennung: der neue Bearbeiter gehoert
// zwingend zur Meldestelle (officeId) des anlegenden Admins.

import { NextResponse } from 'next/server';
import { adminApiGuard } from '@/lib/admin-auth';
import { hashPassword } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { validateHandlerInput } from '@/lib/handlers';
import { canAddHandler } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const guard = adminApiGuard(['ADMIN']);
  if ('error' in guard) {
    return guard.error;
  }
  const session = guard.session;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 });
  }

  const validation = validateHandlerInput(raw);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { email, password, role } = validation.value;

  // E-Mail ist global eindeutig (Login erfolgt ohne Mandantenkontext per E-Mail).
  const existing = await prisma.handler.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json(
      { error: 'Es existiert bereits ein Bearbeiter mit dieser E-Mail.' },
      { status: 409 },
    );
  }

  // Managed-Layer (Phase 10a): Tarif-Limit fuer Bearbeiter:innen pruefen. Greift
  // nur bei aktivem Managed-Layer (BILLING_ENABLED=true); sonst unbegrenzt.
  const office = await prisma.reportingOffice.findUnique({
    where: { id: session.o },
    select: { plan: true },
  });
  if (!office) {
    return NextResponse.json({ error: 'Meldestelle nicht gefunden.' }, { status: 404 });
  }
  const handlerCount = await prisma.handler.count({ where: { officeId: session.o } });
  if (!canAddHandler(office.plan, handlerCount)) {
    return NextResponse.json(
      { error: 'Das Bearbeiter-Limit Ihres Tarifs ist erreicht.' },
      { status: 409 },
    );
  }

  let created: { id: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      // Neuer Bearbeiter gehoert zwingend zur Meldestelle des anlegenden Admins.
      const handler = await tx.handler.create({
        data: { email, passwordHash: hashPassword(password), role, officeId: session.o },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'HANDLER',
          actorId: session.h,
          action: 'HANDLER_CREATED',
          officeId: session.o,
          metadata: { role, handlerId: handler.id },
        },
      });
      return handler;
    });
  } catch {
    return NextResponse.json(
      { error: 'Der Bearbeiter konnte nicht angelegt werden.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
}
